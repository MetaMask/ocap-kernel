import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

export function buildRootObject(_, { name }) {
  let delegatee;
  let offline = false;
  const receivedRequest = makePromiseKit();

  return Far('root', {
    async introduceDelegatee(introduced) {
      delegatee = introduced;
      return undefined;
    },

    request: async () => {
      console.log(`${name} received request`);
      receivedRequest.resolve();

      // Simulate the vat becoming unavailable.
      if (offline) {
        console.log(`${name} unavailable`);
        return 'Unavailable';
      }

      // To hand off to the delegatee, return a promise for their response.
      console.log(`${name} handed off the request`);
      return E(delegatee).request();
    },

    // Simulate a shutdown.
    async shutdown() {
      // In this demo, the delegator hands off the request before the shutdown.
      await receivedRequest.promise;
      // Once shutdown occurs, the delegator no longer processes requests.
      console.log(`${name} shutdown`);
      offline = true;
    },
  });
}
