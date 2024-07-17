export type ExtensionMessage<
  Data extends string | unknown[] | Record<string, unknown>,
> = {
  type: string;
  target: 'background' | 'offscreen';
  data: Data;
};

/**
 * Wrap an async callback to ensure any errors are re-thrown synchronously.
 * @param callback - The async callback to wrap.
 * @returns The wrapped callback.
 */
export const makeHandledCallback = <Args extends unknown[]>(
  callback: (...args: Args) => Promise<void>,
) => {
  return (...args: Args): void => {
    // eslint-disable-next-line n/no-callback-literal, n/callback-return
    callback(...args).catch((error: Error) => {
      throw error;
    });
  };
};
