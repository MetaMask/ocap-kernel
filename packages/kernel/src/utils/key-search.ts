/**
 * Binary search for key position.
 *
 * I totally can't believe I have to write this in 2025, but the JS Array
 * `indexOf` function does exhaustive search (O(n) instead of O(ln(N))) because
 * it can't know the array is both sorted and has no undefined elements.
 *
 * @param arr - A sorted array of strings.
 * @param key - The key to search `arr` for.
 *
 * @returns the index into `arr` of the first key that is greater than
 *   `key`, or -1 if no such key exists.
 */
export function keySearch(arr: string[], key: string): number {
  if (arr === null) {
    // This shouldn't happen, but just in case...
    return -1;
  }
  let beg = 0;
  let end = arr.length - 1;
  if (key < (arr[beg] as string)) {
    return beg;
  }
  if ((arr[end] as string) < key) {
    return -1;
  }
  while (beg <= end) {
    const mid = Math.floor((beg + end) / 2);
    if (arr[mid] === key) {
      return mid;
    }
    if (key < (arr[mid] as string)) {
      end = mid - 1;
    } else {
      beg = mid + 1;
    }
    if (beg === end) {
      return beg;
    }
  }
  return -1;
}
