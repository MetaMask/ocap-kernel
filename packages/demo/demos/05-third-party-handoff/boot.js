import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ alice, bob, brandon, bubba, carol }) {
      // To begin, perform introductions.
      await Promise.all([
        E(bob).introduce(brandon),
        E(brandon).introduce(bubba),
        E(bubba).introduce(carol),
      ]);

      const terminator = () =>
        Promise.all([
          E(bob).terminate(),
          E(brandon).terminate(),
          E(bubba).terminate(),
        ]);

      // Alice will make a request to Bob, which he will hand off to Carol.
      await E(alice).run(bob, Far('terminator', { call: terminator }));
    },
  });
}
