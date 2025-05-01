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

/**
 * Delay execution by the specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
export const delay = async (ms = 1): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
