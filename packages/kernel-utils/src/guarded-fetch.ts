import { resolveFetchInput } from './fetch-input.ts';

/**
 * A gate run before every request a guarded `fetch` makes: the caller's, and
 * each redirect hop that follows from it. It receives the URL that will
 * actually be requested — never the caller's raw input — and refuses it by
 * throwing.
 */
export type FetchGuard = (url: URL, init?: RequestInit) => Promise<void>;

/** The redirect limit the fetch spec imposes. */
const MAX_REDIRECTS = 20;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);

/** The schemes the fetch spec will follow a redirect to. */
const FETCHABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Headers describing a body, dropped along with it when a redirect rewrites
 * the request to a GET. `content-length` is not in the spec's list, because a
 * browser computes it rather than carrying it in the header list; here the
 * caller may have supplied one, and it would then describe a body no longer
 * being sent.
 */
const BODY_HEADERS = [
  'content-encoding',
  'content-language',
  'content-location',
  'content-type',
  'content-length',
];

/**
 * Credentials the caller aimed at one origin, which must not be replayed to
 * another. `fetch` strips exactly these when it follows a redirect itself,
 * bar `host`, which it refuses to send from a header list at all.
 */
const CROSS_ORIGIN_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

/**
 * Whether a body can be sent a second time: only one still held as a value
 * can be, since a stream is consumed by the hop that sent it.
 *
 * Stricter than the spec, which replays a stream whose source it kept. That
 * source is not reachable from here, and a `Request`'s body is a stream
 * however it was built — so a `Request` carrying any body fails a hop that
 * keeps it, where `fetch` would have replayed it. Buffering every body up
 * front so that it could be replayed would make an unbounded upload an
 * unbounded allocation, which is the worse of the two failures.
 *
 * @param body - The body the request carries.
 * @returns Whether it survives a replay.
 */
const isReplayableBody = (body: RequestInit['body']): boolean =>
  body === null ||
  typeof body === 'string' ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body) ||
  body instanceof URLSearchParams ||
  body instanceof Blob ||
  body instanceof FormData;

/**
 * Compare scheme, host and port, which is the comparison undici itself makes
 * when deciding whether to strip these headers on a hop it follows.
 *
 * @param left - One URL.
 * @param right - The other.
 * @returns Whether the two share an origin.
 */
const isSameOrigin = (left: URL, right: URL): boolean =>
  left.protocol === right.protocol &&
  left.hostname === right.hostname &&
  left.port === right.port;

/**
 * A view of `response` that reports `redirected: true`. The flag is derived
 * from the URL list of the response `fetch` returned, and each hop here is a
 * separate `fetch` that saw no redirect of its own — so the last hop reports
 * `false` for a chain the caller did travel. It cannot be defined on the
 * response directly, because the response may be frozen: the vat `fetch`
 * endowment hardens what it returns. The view is not itself hardened, but
 * every write forwards to the target, so a frozen response stays frozen.
 *
 * @param response - The final hop's response.
 * @returns The same response, reporting that it was redirected.
 */
const asRedirected = (response: Response): Response =>
  new Proxy(response, {
    get: (target, property) => {
      if (property === 'redirected') {
        return true;
      }
      if (property === 'clone') {
        return () => asRedirected(target.clone());
      }
      const value = Reflect.get(target, property, target);
      // Bound to the target: a `Response` reaches its state through `this`,
      // and a private field lookup on a proxy throws.
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

/**
 * Wrap a `fetch` so that `guard` runs before every request it makes, the
 * caller's and every redirect hop alike.
 *
 * The caller's input is resolved to a URL exactly once and replaced with a
 * stand-in that resolves to nothing else, so the URL `guard` approves is the
 * URL that is requested. Redirects are then followed here rather than by
 * `fetch`, one hop at a time: left to itself `fetch` walks the whole chain and
 * consults nobody, so a guard that only ever sees the pre-flight URL is one
 * `Location` header away from being bypassed.
 *
 * A hop `guard` refuses fails the whole call; the caller never sees the
 * refused host's response. A hop it allows is followed transparently, so the
 * response returned is the one the chain ended at. A caller asking for
 * `redirect: 'manual'` or `'error'` is asking for less than that and is
 * obeyed; one asking for `'follow'` gets the guarded walk instead, which is
 * the only mode that could otherwise reach an unapproved host.
 *
 * @param options - An options bag.
 * @param options.baseFetch - The `fetch` to make requests with.
 * @param options.guard - The gate to run before each request.
 * @returns A `fetch` gated by `guard`.
 */
export const makeGuardedFetch = ({
  baseFetch,
  guard,
}: {
  baseFetch: typeof fetch;
  guard: FetchGuard;
}): typeof fetch => {
  /**
   * Make one request and insist on being able to see where it points next.
   *
   * @param target - What to request; already resolved, never the caller's own.
   * @param requestInit - The init to request it with.
   * @param at - The URL `target` resolves to, for the error message.
   * @returns The response.
   */
  const requestOnce = async (
    target: Parameters<typeof fetch>[0],
    requestInit: RequestInit,
    at: URL,
  ): Promise<Response> => {
    const response = await baseFetch(target, requestInit);
    // Undici answers a manual redirect with the real response. A browser
    // follows the spec and answers with an opaque-redirect one — status 0, no
    // headers — which hides the hop rather than exposing it for checking.
    // Refuse: returning it would hand the caller something that silently is
    // not the resource they asked for.
    if (response.type === 'opaqueredirect') {
      throw new Error(
        `Fetch of ${at.href} was redirected, but this runtime hides the target of a manual redirect, so the hop cannot be checked.`,
      );
    }
    return response;
  };

  const guardedFetch = async (
    ...[rawInput, rawInit]: Parameters<typeof fetch>
  ): Promise<Response> => {
    const { url, input } = resolveFetchInput(rawInput);

    // undici honours a `dispatcher` in place of the transport, so it decides
    // where the bytes go whatever URL the guard approved. Refused rather than
    // dropped: dropping it would fall back to the global transport and send
    // the request anyway, so a caller relying on a proxy or a client
    // certificate would silently egress without one.
    if (rawInit?.dispatcher !== undefined) {
      throw new Error(
        'A guarded fetch cannot accept a `dispatcher`: it stands in for the transport, so it would decide where the bytes go whatever URL the guard approved. Build it into the `baseFetch` instead.',
      );
    }

    // Read the caller's `init` once, into an object of our own, so that no
    // later read can see a destination the guard did not. Its `body` and
    // `signal` are still the caller's objects — neither can be copied, and
    // neither names a destination.
    const init: RequestInit = { ...rawInit, redirect: 'manual' };

    // The request state a redirect carries or rewrites. With a `Request` input
    // it lives on the request, and `init` wins wherever it names the same
    // thing, which is how `fetch` merges the two. Reading it costs nothing
    // here — none of these accessors consumes a body.
    const request = input instanceof Request ? input : undefined;
    if (request) {
      // A redirect carries these over unchanged, and a hop is built from the
      // init alone — so what arrived on the `Request` has to be copied across
      // or it is silently dropped from the second hop onward. `integrity` is
      // the one with teeth: an unenforced digest is worse than none.
      init.credentials ??= request.credentials;
      init.integrity ??= request.integrity;
      init.keepalive ??= request.keepalive;
      init.mode ??= request.mode;
      init.referrer ??= request.referrer;
      init.referrerPolicy ??= request.referrerPolicy;
    }
    const signal =
      init.signal === undefined ? (request?.signal ?? null) : init.signal;
    // Snapshotted into the init as well, so the guard and `fetch` are shown
    // the same headers however long the guard takes to answer.
    const headers = new Headers(init.headers ?? request?.headers);
    init.headers = headers;
    // Kept verbatim rather than normalized: `fetch` upper-cases the methods it
    // knows and passes anything else along as written.
    let method = init.method ?? request?.method ?? 'GET';
    // A `body` of `null` means "not supplied", as it does to `fetch`, so a
    // `Request`'s own body still stands behind it.
    let body = init.body ?? request?.body ?? null;

    // Read before `redirect` is overridden. Only `follow` — the mode that
    // would otherwise walk to an unapproved host — is overridden; a caller
    // asking for less than that is obeyed.
    const requested = rawInit?.redirect ?? request?.redirect ?? 'follow';

    await guard(url, init);
    let response = await requestOnce(input, init, url);

    let currentUrl = url;
    let redirects = 0;

    while (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      // A redirect status with no usable `Location` is just a response. An
      // empty one resolves back to the current URL, which `fetch` dutifully
      // requests twenty more times; there is nothing there to follow.
      if (!location?.trim()) {
        break;
      }
      if (requested === 'manual') {
        return response;
      }
      if (requested === 'error') {
        throw new Error(
          `Fetch of ${currentUrl.href} was redirected, and redirect: 'error' was requested.`,
        );
      }
      // Nothing below reads this response, and its connection is held open
      // until the body is either read or discarded. A cancel that fails means
      // the stream was already errored or locked — the bytes are gone either
      // way, and failing a fetch over a body nobody wanted would be worse.
      await response.body?.cancel().catch(() => undefined);

      redirects += 1;
      if (redirects > MAX_REDIRECTS) {
        throw new Error(
          `Fetch of ${url.href} exceeded ${MAX_REDIRECTS} redirects; gave up at ${currentUrl.href}.`,
        );
      }

      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch (cause) {
        throw new Error(
          `Fetch of ${currentUrl.href} was redirected to an unusable location.`,
          { cause },
        );
      }
      // The guard would refuse these anyway, having no host to match, but it
      // would refuse them as a nameless host rather than as what they are.
      if (!FETCHABLE_PROTOCOLS.has(nextUrl.protocol)) {
        throw new Error(
          `Fetch of ${currentUrl.href} was redirected to a ${nextUrl.protocol} URL, which a guarded fetch will not follow.`,
        );
      }

      const { status } = response;
      const normalizedMethod = method.toUpperCase();
      // The fetch spec's rewrite: 303 turns anything but a GET or HEAD into a
      // bodyless GET, and 301/302 do the same for a POST alone.
      if (
        (status === 303 &&
          normalizedMethod !== 'GET' &&
          normalizedMethod !== 'HEAD') ||
        ((status === 301 || status === 302) && normalizedMethod === 'POST')
      ) {
        method = 'GET';
        body = null;
        BODY_HEADERS.forEach((name) => headers.delete(name));
      }
      if (!isSameOrigin(currentUrl, nextUrl)) {
        CROSS_ORIGIN_HEADERS.forEach((name) => headers.delete(name));
      }
      if (!isReplayableBody(body)) {
        throw new Error(
          `Cannot follow the ${status} redirect from ${currentUrl.href} to ${nextUrl.href}: it keeps the request body, and this one cannot be sent a second time. A Request's body is a stream whatever it was built from — pass the body through the init argument instead, where it can be replayed.`,
        );
      }

      const hopInit: RequestInit = { ...init, method, headers, body, signal };
      await guard(nextUrl, hopInit);
      // Requested as a string, so this hop's destination is fixed as firmly as
      // the first hop's.
      response = await requestOnce(nextUrl.href, hopInit, nextUrl);
      currentUrl = nextUrl;
    }

    return redirects === 0 ? response : asRedirected(response);
  };
  return harden(guardedFetch);
};
harden(makeGuardedFetch);
