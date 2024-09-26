/**
 * A simple counter which increments and returns when called.
 *
 * @param start - One less than the first returned number.
 * @returns A counter.
 */
export const makeCounter = (start: number = 0) => {
  let counter: number = start;
  return () => {
    counter += 1;
    return counter;
  };
};
