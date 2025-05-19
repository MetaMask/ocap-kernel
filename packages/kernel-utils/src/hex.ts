// XXX TODO: The following two hex conversion functions are placeholders. In
// particular, they're not as paranoid as they ought to be, which I'll
// rationalize by observing that we only use them on data of strictly internal
// provenance. However, I'm quite prepared to bet we can find any number of better,
// off-the-shelf packages in NPM that we could just use, and one of them
// probably should be substituted.

/**
 * Convert a Uint8Array into a hex string.
 *
 * @param arr - The bytes to convert.
 *
 * @returns `arr` represented as a hex string.
 */
export function toHex(arr: Uint8Array): string {
  let result = '';
  for (const byte of arr) {
    const byteHex = byte.toString(16);
    result += byteHex.length === 1 ? `0${byteHex}` : byteHex;
  }
  return result;
}

/**
 * Convert a hex string into a Uint8Array.
 *
 * @param str - The string to convert.
 *
 * @returns the bytes described by `str`.
 */
export function fromHex(str: string): Uint8Array {
  const len = str.length;
  const resultLen = len / 2;
  const bytes = new Uint8Array(32);
  let inIdx = 0;
  let outIdx = 0;
  while (outIdx < resultLen) {
    const digits = str.slice(inIdx, inIdx + 2);
    bytes[outIdx] = parseInt(digits, 16);
    outIdx += 2;
    inIdx += 2;
  }
  return bytes;
}
