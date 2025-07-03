import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ alice, bob, carol }) {
      console.log(
        `Making connections: ${await Promise.all([
          E(alice).introduce(bob),
          E(bob).introduce(carol),
        ])}`,
      );
    },
  });
}
