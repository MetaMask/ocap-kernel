/**
 * Make a `fetch` input whose stringifier answers `first` on the first read and
 * `rest` on every read thereafter — the CWE-367 primitive from the reported
 * vat sandbox escape, where a host allowlist validated one URL and `fetch`
 * requested another.
 *
 * Pass the same value twice for a stringifier that is merely unusual rather
 * than hostile.
 *
 * @param first - The URL to report on the first read.
 * @param rest - The URL to report on every read after the first.
 * @returns The input, typed as a fetch input, and a count of how often its
 * stringifier has been called.
 */
export const makeTwoFacedFetchInput = (
  first: string,
  rest: string,
): { input: RequestInfo | URL; getReads: () => number } => {
  let reads = 0;
  const input = {
    toString: () => {
      reads += 1;
      return reads === 1 ? first : rest;
    },
  };
  return {
    input: input as unknown as RequestInfo | URL,
    getReads: () => reads,
  };
};
