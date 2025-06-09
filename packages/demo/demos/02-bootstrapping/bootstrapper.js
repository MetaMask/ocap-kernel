import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ alice, bob }) {
      // Say hello here.
      await E(alice).hello().then(console.log);
      await E(bob).hello().then(console.log);

      // Say goodbye over there.
      await E(alice).goodbye();
      await E(bob).goodbye();
    },
  });
}
