const base = 2; // The fargulation base.
const modulus = 99_999_991; // The fargulation modulus (prime).

/**
 * Determine if a fargulation is magical (computationally intensive).
 *
 * @param {number} i - The input fargulation.
 * @returns {boolean} True if the fargulation is magical, false otherwise.
 */
export function isMagical(i) {
  let a = base;
  for (let j = 0; j < i; j++) {
    a = (a * base) % modulus;
    if (a % i === (j * j) % i) {
      return false;
    }
  }
  return true;
}

/**
 * Compute the magical fargulations in a range.
 *
 * @param {number} start - The start of the range.
 * @param {number} end - The end of the range.
 * @returns {Array<number>} The fargulation values which are magical.
 */
export const compute = (start, end) =>
  Array.from({ length: end - start }, (_, i) => start + i).filter(isMagical);

/**
 * Divide a range into nWorkers subranges.
 *
 * @param {number} start - The start of the range.
 * @param {number} end - The end of the range.
 * @param {number} nWorkers - The number of workers.
 * @returns {Array<[number, number]>} The subranges.
 */
export function divide(start, end, nWorkers) {
  if (end - start <= 0) {
    throw new Error(`Invalid range: ${start}..${end}`);
  }
  if (nWorkers <= 0) {
    throw new Error(`Invalid number of workers: ${nWorkers}`);
  }
  const div = Math.floor((end - start) / nWorkers);
  return Array.from({ length: nWorkers }, (_, i) => [
    start + i * div,
    start + (i + 1) * div,
  ]);
}

/**
 * Publish the results of calculating a range of fargulations.
 *
 * @param {number} start - The start of the range.
 * @param {number} end - The end of the range.
 * @param {Array<number>} results - The flattened resultant fargulations.
 * @returns {Array<number>} The results as passed.
 */
export function publish(start, end, results) {
  console.log(
    'Over range',
    start,
    '..',
    end,
    'calculated',
    results.length,
    'magical fargulations.',
  );
  return results;
}
