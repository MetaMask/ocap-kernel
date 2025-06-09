/**
 * Example 05: Delegation.
 * -----------------------
 * This demo shows a work method that delegates to a list of workers, which may
 * themselves delegate to other workers or simply perform the work individually.
 *
 * @see delegator.js for the divide and conquer implementation.
 */

import { E, Far } from '@endo/far';

export function buildRootObject(_, { start = 0, end = 10_000 }) {
  return Far('root', {
    async bootstrap(vats) {
      // Recursively assign delegation paths, starting from the head vat.
      const assignWorkers = async (name) => {
        const vat = vats[name];
        const delegates = await E(vat).getDelegates();
        for (const delegate of delegates) {
          console.log(name, '->', delegate);
          await E(vat).addWorker(vats[delegate]);
          await assignWorkers(delegate);
        }
      };

      console.log('Assigning workers:');
      console.log('---');
      await assignWorkers('head');
      console.log(' ');

      console.log('Computing magical fargulations:');
      console.log('---');
      const result = await E(vats.head).work(start, end);
      console.log(' ');

      console.log(
        'Computed magical fargulations (',
        result.length,
        'total ):',
        result,
      );
    },
  });
}
