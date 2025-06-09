/**
 * Example 05: Delegation.
 * -----------------------
 * This vat's root object declares a work method that delegates to a list of
 * workers, which may themselves delegate to other workers or simply perform
 * the work individually.
 *
 * @see bootstrap.js for the assignment of the delegation tree.
 */

import { E, Far } from '@endo/far';

import { divide, compute, publish } from './labor.js';

export function buildRootObject(_, { delegates = [] }) {
  // A worthy delegator remembers that they too can work.
  const workers = [
    {
      work(start, end) {
        const results = compute(start, end);
        return publish(start, end, results);
      },
    },
  ];

  return Far('root', {
    getDelegates: () => delegates,
    addWorker: (worker) => workers.push(worker),

    async work(start, end) {
      return Promise.all(
        divide(start, end, workers.length).map((subrange, i) =>
          E(workers[i]).work(...subrange),
        ),
      ).then((results) => publish(start, end, results.flat()));
    },
  });
}
