/**
 * Create a module mock for `@endo/promise-kit`.
 *
 * @returns The mock.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makePromiseKitMock = () => ({
  makePromiseKit: () => {
    let resolve: (value: unknown) => void, reject: (reason?: unknown) => void;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    // @ts-expect-error We have in fact assigned resolve and reject.
    return { promise, resolve, reject };
  },
});
