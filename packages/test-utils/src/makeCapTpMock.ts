/**
 * Create a module mock for `@endo/captp`.
 *
 * @returns The mock.
 */

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const makeCapTpMock = () => ({
  makeCapTP: (
    id: string,
    send: (message: unknown) => Promise<void>,
    bootstrapObj?: unknown,
  ) => {
    const capTp = {
      id,
      send,
      bootstrapObj,
      dispatch: () => undefined,
      getBootstrap: () => capTp.bootstrapObj,
    };
    return capTp;
  },
});
