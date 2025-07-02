import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ alice, bob, brandon, bubba, carol }) {
      // To begin, perform introductions.
      console.log(
        `Introductions: ${await Promise.all([
          E(bob).connectTo(brandon),
          E(brandon).connectTo(bubba),
          E(bubba).connectTo(carol),
        ])}`,
      );

      const unlink = () =>
        Promise.all([
          E(bob).disconnect(),
          E(brandon).disconnect(),
          E(bubba).disconnect(),
        ]);

      // Alice will make a request to Bob, which he will hand off to Carol.
      await E(alice).run(bob, Far('connection', { unlink }));
    },
  });
}
