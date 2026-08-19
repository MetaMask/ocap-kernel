export type FetchInput = Parameters<typeof fetch>[0];

export type ResolvedFetchInput = {
  /** The URL that `fetch` will request. */
  url: URL;
  /**
   * What to hand to `fetch` in place of the caller's input. Resolving it again
   * always yields `url`, however often and whenever it is read. It is not
   * otherwise sealed off from the caller: a `Request` body stream is still the
   * caller's, so the guarantee is over the destination, not the payload.
   */
  input: FetchInput;
};

/**
 * Find the genuine `url` accessor for `Request` instances. It is not always an
 * own property of `Request.prototype`: jsdom, for one, exposes a `Request`
 * subclass whose own prototype carries only `constructor`, leaving the
 * accessor a level up.
 *
 * @returns The accessor, or `undefined` if this environment has no `Request`.
 */
const findRequestUrlAccessor = (): ((this: Request) => string) | undefined => {
  let proto: object | null =
    typeof Request === 'undefined' ? null : Request.prototype;
  while (proto) {
    // Deliberately unbound: applied to whichever `Request` a caller passes.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { get } = Object.getOwnPropertyDescriptor(proto, 'url') ?? {};
    if (get) {
      return get as (this: Request) => string;
    }
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
};

/**
 * Captured at module load so that later tampering cannot redirect the read.
 * `fetch` takes a `Request`'s URL from the internal slot this accessor reads,
 * whereas `request.url` may be an override on a subclass.
 */
const getRequestUrl = findRequestUrlAccessor();

/**
 * Resolve a `fetch` input to the URL that will actually be requested, along
 * with a stand-in input that cannot resolve to any other URL.
 *
 * `fetch` accepts any object with a stringifier and stringifies it itself, so
 * code that validates `new URL(input)` and then forwards the caller's `input`
 * lets the input decide what each read returns — validating one URL while
 * requesting another (CWE-367). A `Request` is no safer: a subclass can
 * override `url`, and on some runtimes the state behind it is a mutable own
 * property. Forwarding the returned `input` closes both: its destination comes
 * from a string resolved here, so the check and the request cannot disagree.
 *
 * The result is deliberately not hardened: `harden` would transitively freeze
 * `URL.prototype`.
 *
 * @param input - The first argument to `fetch`: a string, `URL`, `Request`, or
 * anything else `fetch` would stringify.
 * @returns The resolved URL and the input to forward in its place.
 * @throws If the input does not resolve to a valid absolute URL.
 */
export const resolveFetchInput = (input: FetchInput): ResolvedFetchInput => {
  // A string is immutable, so it is already its own stand-in.
  if (typeof input === 'string') {
    return { url: new URL(input), input };
  }
  if (input instanceof Request) {
    // Two steps, and both are load-bearing.
    //
    // Copy first, so that only a genuine `Request`'s internals are read below.
    // A `Request` carries settings such as undici's `dispatcher` — which
    // decides where the bytes actually go — behind internal keys, but the
    // second step reads its argument as a `RequestInit`, by string name. Given
    // the caller's own object that would let a planted `dispatcher` property
    // route the request anywhere. This throws for anything wearing
    // `Request.prototype` without the backing state.
    const genuine = new Request(input);
    // Then rebuild around the URL as a string. Copying alone is not enough:
    // runtimes differ in how tamper-proof a `Request`'s state is, and undici on
    // Node 22 keeps it in a configurable own property, so a caller can leave a
    // `URL` object it still holds in there — copied by reference, then mutated
    // after the check and re-read at send time. Parsing a string fixes the
    // destination.
    const href = getRequestUrl ? getRequestUrl.call(genuine) : genuine.url;
    const url = new URL(href);
    return { url, input: new Request(url.href, genuine) };
  }
  // A `URL`, or an object with a stringifier. Both reads below are ours, and
  // the URL is parsed from the captured primitive rather than from `input`,
  // so the object is never consulted again.
  const href = String(input);
  const url = new URL(href);
  // Forwarding a primitive already makes a second read harmless, but an input
  // that answers differently each time is an escape attempt in progress, not a
  // mistake. Refuse it, so it surfaces as an error instead of a silent request
  // to whichever URL it happened to show first.
  if (String(input) !== href) {
    throw new Error('fetch input resolved to a different URL when read again.');
  }
  return { url, input: url.href };
};
