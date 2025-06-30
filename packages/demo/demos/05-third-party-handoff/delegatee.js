import { Far } from '@endo/far';

export function buildRootObject(_, { name }) {
  // This dummy promise controls when the delegatee completes the request.
  let waitFor;

  return Far('root', {
    async setWaitFor(promise) {
      waitFor = promise;
      return undefined;
    },

    async request() {
      console.log(`${name} processing request`);
      // Simulate work by waiting for the dummy promise to be resolved.
      return waitFor.then(() => {
        console.log(`${name} processed request`);
        return 42;
      });
    },
  });
}
