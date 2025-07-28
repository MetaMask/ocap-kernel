/**
 * Make an endowment for the fetch API.
 *
 * @returns An endowment that provides the fetch API, but no fetch implementation.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function makeFetchEndowment() {
  return {
    /* eslint-disable n/no-unsupported-features/node-builtins */
    Headers: harden(globalThis.Headers ?? class {}),
    Request: harden(globalThis.Request ?? class {}),
    Response: harden(globalThis.Response ?? class {}),
    /* eslint-enable n/no-unsupported-features/node-builtins */
  };
}
