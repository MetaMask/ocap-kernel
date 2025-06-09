/**
 * Example 03: Remotables.
 * -----------------------
 * This example shows how to use a remotable object returned by another vat.
 *
 * @see keeper.js for the vat that exports the remotable object.
 * @see cluster.json for the keeper vat's initial value.
 */
import { E, Far } from '@endo/far';

export function buildRootObject(_, { guesses = ['foo', 'bar'] }) {
  return Far('root', {
    async bootstrap({ keeper }) {
      // The keeper's momento method returns a remotable 'momento' object.
      const momento = await E(keeper).momento();

      // The momento won't reveal the keeper's value to us, but it will allow
      // us to check if the current value matches the value when the momento
      // was created. We can try to discover the momento's value via
      // guess-and-check.
      for (const guess of guesses) {
        await E(keeper).setValue(guess);
        // We can await the methods of our remotable object using the E()
        // wrapper.
        if (await E(momento).matches()) {
          console.log(`Momento value: ${guess}`);
          return;
        }
        console.log(`Guess: ${guess} (not a match)`);
      }
    },
  });
}
