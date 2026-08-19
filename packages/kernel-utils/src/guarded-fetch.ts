import { resolveFetchInput } from './fetch-input.ts';
import type { ResolvedFetchInput } from './fetch-input.ts';
import {
  bytesMatchIntegrity,
  parseIntegrityMetadata,
} from './subresource-integrity.ts';

/**
 * Run before every request a guarded `fetch` makes — the caller's and each
 * redirect hop — on the URL that will actually be requested. Throws to refuse.
 *
 * Takes the URL alone: a guard given the request as well would be shown a
 * first hop assembled differently from every later one, and a policy that is
 * sound only after the first hop is worse than one that cannot be written.
 */
export type FetchGuard = (url: URL) => Promise<void>;

/** The redirect limit the fetch spec imposes. */
const MAX_REDIRECTS = 20;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([
  301, 302, 303, 307, 308,
]);

const FETCHABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Dropped with the body when a redirect rewrites the request to a GET.
 * `content-length` is not in the spec's list, since a browser computes it; a
 * caller here can supply one, and it would then describe a body not sent.
 */
const BODY_HEADERS: readonly string[] = harden([
  'content-encoding',
  'content-language',
  'content-location',
  'content-type',
  'content-length',
]);

/**
 * Stripped when a hop leaves the origin, which is what `fetch` does itself —
 * bar `host`, which it refuses to send from a header list at all.
 */
const CROSS_ORIGIN_HEADERS: readonly string[] = harden([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

/**
 * Stricter than the spec, which replays a stream from a source it kept. That
 * source is not reachable from here, and a `Request`'s body is a stream however
 * it was built, so a `Request` carrying any body fails a hop that keeps it.
 * Buffering every body up front would turn an unbounded upload into an
 * unbounded allocation, the worse of the two failures.
 *
 * @param body - The body the request carries.
 * @returns Whether it can be sent again.
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
 * Matches undici's own origin comparison for a hop it follows. Spelled out
 * rather than `left.origin === right.origin`, which reports `"null"` for an
 * opaque origin and would call two such URLs the same.
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
 * Release a response nobody will read. Its connection is held open until the
 * body is either read or discarded, so every exit that abandons one comes
 * through here. A cancel that fails means the stream was already errored or
 * locked — the bytes are gone either way, and failing a fetch over a body
 * nobody wanted would be worse.
 *
 * @param response - The response to abandon.
 */
const discardBody = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => undefined);
};

/**
 * Check a response body against the digest the caller asked for.
 *
 * `fetch` is not left to do this. It checks an `integrity` against the body of
 * the one request it was given, and a request here is a single hop, so a digest
 * of the resource would be compared to each 3xx body along the way and no chain
 * longer than one hop could succeed. The digest is withheld from `baseFetch` and
 * spent here instead, on the body actually handed back — which is where the
 * spec spends it too, after the chain has been walked.
 *
 * Stricter than `fetch` in one respect: metadata naming no algorithm SRI is
 * defined over is refused rather than ignored, because a caller that asked for a
 * digest and had none checked is worse off than one that asked for nothing.
 *
 * @param options - An options bag.
 * @param options.response - The response about to be handed back.
 * @param options.url - Where it came from, for the error messages.
 * @param options.integrity - The caller's integrity metadata; `''` for none.
 */
const checkIntegrity = async ({
  response,
  url,
  integrity,
}: {
  response: Response;
  url: URL;
  integrity: string;
}): Promise<void> => {
  if (integrity === '') {
    return;
  }
  const check = parseIntegrityMetadata(integrity);
  if (!check) {
    await discardBody(response);
    throw new Error(
      `Fetch of ${url.href} requested integrity \`${integrity}\`, which names no hash algorithm a guarded fetch can check. Use sha256, sha384 or sha512.`,
    );
  }
  // No bytes is no match, as it is none to `fetch`: a 204, a 304 and an answer
  // to a HEAD carry no body, and the digest names one.
  if (!response.body) {
    throw new Error(
      `Fetch of ${url.href} requested integrity \`${integrity}\`, but the response carries no body to check it against.`,
    );
  }
  // Read from a clone, because a body can be read once and these bytes are the
  // caller's. Cloning tees the stream, so what is checked is what is handed
  // back — at the cost of holding the body in memory, which is what checking a
  // digest costs however it is done, `fetch` included.
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  if (!(await bytesMatchIntegrity(bytes, check))) {
    await discardBody(response);
    throw new Error(
      `Fetch of ${url.href} does not match the requested integrity \`${integrity}\`.`,
    );
  }
};

/**
 * Each hop is a separate `fetch` that saw no redirect of its own, so the last
 * one reports `redirected: false` for a chain the caller did travel. A proxy
 * rather than a defined property because the response may be frozen — the vat
 * `fetch` endowment hardens what it returns — and every write here forwards to
 * the target, so a frozen response stays frozen.
 *
 * Being a proxy, it satisfies `instanceof Response` and answers method calls,
 * but it is not the response: `Response.prototype.text.call(view)` throws where
 * `view.text()` works, and each read of a method yields a fresh bound function.
 *
 * @param response - The final hop's response.
 * @returns The same response, reporting that it was redirected.
 */
const asRedirected = (response: Response): Response =>
  new Proxy(response, {
    get: (target, property) => {
      // A platform `Response` carries both of these on its prototype, so there
      // is nothing own to contradict. A response that is a frozen plain object
      // — a test double, say — carries them as non-configurable own values, and
      // overriding one would violate a proxy invariant and throw on every read.
      // Report what is there instead: a wrong flag beats an unreadable response.
      if (!Object.hasOwn(target, property)) {
        if (property === 'redirected') {
          return true;
        }
        if (property === 'clone') {
          return () => asRedirected(target.clone());
        }
      }
      const value = Reflect.get(target, property, target);
      // Bound to the target: a `Response` reaches its state through `this`,
      // and a private field lookup on a proxy throws.
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

/**
 * Wrap a `fetch` so that `guard` runs before every request it makes.
 *
 * Redirects are followed here, one hop at a time, rather than by `fetch`: left
 * to itself `fetch` walks the whole chain and consults nobody, so a guard that
 * sees only the pre-flight URL is one `Location` header away from being
 * bypassed. The caller's input is resolved once by {@link resolveFetchInput},
 * so the URL `guard` approves is the URL requested.
 *
 * `redirect: 'follow'` is therefore overridden and `baseFetch` is always called
 * with `'manual'`; `'manual'` and `'error'` ask for less than the guarded walk
 * and are obeyed.
 *
 * Walking the chain here also takes `integrity` out of `fetch`'s hands, since a
 * digest of the resource would otherwise be checked against a hop; see
 * {@link checkIntegrity}.
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
   * Takes the resolved pair rather than a destination and the URL it is claimed
   * to be, so the two cannot disagree and the caller's own input is not of a
   * type this accepts.
   *
   * @param resolved - What to request, and the URL it resolves to.
   * @param resolved.url - The URL that will be requested.
   * @param resolved.input - What to hand `baseFetch` to request it.
   * @param requestInit - The init to request it with.
   * @returns The response.
   */
  const requestOnce = async (
    { url, input }: ResolvedFetchInput,
    requestInit: RequestInit,
  ): Promise<Response> => {
    const response = await baseFetch(input, requestInit);
    // Undici answers a manual redirect with the real response; a browser
    // follows the spec and answers with an opaque-redirect one — status 0, no
    // headers — which hides the hop instead of exposing it for checking.
    if (response.type === 'opaqueredirect') {
      await discardBody(response);
      throw new Error(
        `Fetch of ${url.href} was redirected, but this runtime hides the target of a manual redirect, so the hop cannot be checked.`,
      );
    }
    // Every request here asks for `manual`, so a chain was walked by something
    // below `baseFetch` that never consulted the guard. Refuse the response:
    // treating it as the approved resource is the pre-flight-only checking this
    // wrapper exists to replace.
    if (response.redirected) {
      await discardBody(response);
      throw new Error(
        `Fetch of ${url.href} followed a redirect below the guard, which cannot check where it went. A guarded fetch's \`baseFetch\` must honour \`redirect: 'manual'\`.`,
      );
    }
    return response;
  };

  const guardedFetch = async (
    ...[rawInput, rawInit]: Parameters<typeof fetch>
  ): Promise<Response> => {
    const resolved = resolveFetchInput(rawInput);
    const { url, input } = resolved;

    // Snapshot the caller's `init`, so no later read can see a destination the
    // guard did not. `body` and `signal` stay the caller's objects: neither can
    // be copied, and neither names a destination.
    const init: RequestInit = { ...rawInit };

    // Checked on the copy, not on `rawInit`: an accessor answering the check
    // with `undefined` and the copy with a dispatcher is the same substitution
    // this wrapper exists to stop. Refused rather than dropped, because
    // dropping it would fall back to the global transport and send anyway, so a
    // caller relying on a proxy or a client certificate would silently egress
    // without one. Reached through `in` so the check compiles where the ambient
    // `RequestInit` is the DOM one, which does not declare `dispatcher`.
    //
    if ('dispatcher' in init && init.dispatcher !== undefined) {
      throw new Error(
        'A guarded fetch cannot accept a `dispatcher`: it stands in for the transport, so it would decide where the bytes go whatever URL the guard approved. Build it into the `baseFetch` instead.',
      );
    }

    // `init` wins wherever it names the same thing as the `Request`, which is
    // how `fetch` merges the two. None of these accessors consumes a body.
    const request = input instanceof Request ? input : undefined;
    if (request) {
      // A hop is built from the init alone, so what arrived on the `Request`
      // has to be copied across or it is silently dropped from the second hop
      // onward. `integrity` is the exception, withheld from every hop below.
      // Not `cache`: this package compiles against undici's `RequestInit`,
      // which has no such field because undici ignores cache mode. A hop in a
      // browser realm therefore reverts to the default.
      init.credentials ??= request.credentials;
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

    // Read from the copy, before `redirect` is overridden below.
    const requested = init.redirect ?? request?.redirect ?? 'follow';
    init.redirect = 'manual';

    // Taken off the request and checked by {@link checkIntegrity} instead, on
    // whichever response is handed back. Read from the `Request` too, since
    // either can carry it, and overridden with `''` rather than deleted: to
    // `fetch` only an empty string means "no digest", and an absent init member
    // leaves a `Request`'s own integrity standing.
    const integrity = init.integrity ?? request?.integrity ?? '';
    init.integrity = '';

    await guard(url);
    let response = await requestOnce(resolved, init);

    let currentUrl = url;
    let redirects = 0;

    while (REDIRECT_STATUSES.has(response.status)) {
      // Answered before the `Location` header is consulted, as the spec does:
      // the mode turns on the status alone, so `error` fails a redirect that
      // names nowhere to go rather than passing it off as an ordinary response.
      if (requested === 'manual') {
        // The caller asked for the 3xx itself, so the 3xx is the body a digest
        // has to answer for — as it is to `fetch`, which fails a manual
        // redirect carrying an `integrity` for the same reason.
        await checkIntegrity({ response, url: currentUrl, integrity });
        return response;
      }
      if (requested === 'error') {
        await discardBody(response);
        throw new Error(
          `Fetch of ${currentUrl.href} was redirected, and redirect: 'error' was requested.`,
        );
      }
      const location = response.headers.get('location');
      // A redirect status with no usable `Location` is just a response. An
      // empty one resolves back to the current URL, which `fetch` dutifully
      // requests twenty more times; there is nothing there to follow.
      if (!location?.trim()) {
        break;
      }
      // Nothing below reads this response.
      await discardBody(response);

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

      // Resolved through the same function as the caller's input, so this hop's
      // destination is fixed the same way the first hop's was — including
      // against a guard that normalizes in place the URL it was handed, which is
      // now a `URL` nothing else here holds. Asked first, so a hop out of the
      // allowlist is reported as that rather than as whatever else about it is
      // also wrong.
      const nextResolved = resolveFetchInput(nextUrl.href);
      await guard(nextResolved.url);

      const { status } = response;
      // The fetch spec's own rewrite of the method and body across these
      // statuses. Normalized here only: `fetch` upper-cases the methods it
      // knows and passes anything else along as written.
      const normalizedMethod = method.toUpperCase();
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
          `Cannot follow the ${status} redirect from ${currentUrl.href} to ${nextResolved.url.href}: it keeps the request body, and a stream cannot be sent a second time. Pass a body that can be replayed — a string, ArrayBuffer, view, URLSearchParams, Blob or FormData — through the init argument; a Request's body is a stream whatever it was built from.`,
        );
      }

      const hopInit: RequestInit = { ...init, method, headers, body, signal };
      response = await requestOnce(nextResolved, hopInit);
      currentUrl = nextResolved.url;
    }

    await checkIntegrity({ response, url: currentUrl, integrity });
    return redirects === 0 ? response : asRedirected(response);
  };
  return harden(guardedFetch);
};
harden(makeGuardedFetch);
