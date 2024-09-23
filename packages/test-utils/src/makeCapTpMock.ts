/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Create a module mock for `@endo/captp`.
 *
 * @returns The mock.
 */
export const makeCapTpMock = () => ({
  makeCapTP: (
    id: string,
    send: (message: unknown) => Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bootstrapObj?: any,
  ) => {
    const capTp = {
      id,
      send,
      dispatch: () => undefined,
      getBootstrap: () => undefined,
      bootstrapObj: bootstrapObj ?? {
        testMethod: Promise.resolve('bootstrap-result'),
      },
    };
    capTp.getBootstrap = () => capTp.bootstrapObj;
    return capTp;
  },
});
