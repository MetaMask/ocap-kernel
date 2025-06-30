import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

export function buildRootObject() {
  // This dummy promise controls when Carol completes the request.
  const waitFor = makePromiseKit();

  return Far('root', {
    async bootstrap({ alice, bob, carol }) {
      // To begin, perform introductions.
      await Promise.all([
        E(alice).introduceService(bob),
        E(bob).introduceDelegatee(carol),
        E(carol).setWaitFor(waitFor.promise),
      ]);

      // Alice will make a request to Bob which he will hand off to Carol.
      const result = E(alice).run();

      await Promise.all([
        // Alice receives the result from Carol directly.
        result,
        E(bob)
          // While the request is being processed, Bob becomes unavailable.
          .shutdown()
          // But Carol can still route the response to Alice.
          .then(() => {
            waitFor.resolve();
            return undefined;
          }),
      ]);
    },
  });
}
