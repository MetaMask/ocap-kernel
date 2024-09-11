export type VatId = string;

/**
 * Wrap an async callback to ensure any errors are at least logged.
 *
 * @param callback - The async callback to wrap.
 * @returns The wrapped callback.
 */
export const makeHandledCallback = <Args extends unknown[]>(
  callback: (...args: Args) => Promise<void>,
) => {
  return (...args: Args): void => {
    // eslint-disable-next-line n/no-callback-literal, n/callback-return
    callback(...args).catch(console.error);
  };
};

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
