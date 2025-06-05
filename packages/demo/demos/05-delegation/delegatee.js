/**
 * Example 05: Delegation.
 * -----------------------
 * This vat's work method computes magical fargulations in a range.
 *
 * @see bootstrap.js for the assignment of the delegation tree.
 * @see delegator.js for the delegator that delegates to this vat.
 */

import { Far } from '@endo/far';

import { compute, publish } from './labor.js';

export function buildRootObject() {
  return Far('root', {
    work(start, end) {
      const results = compute(start, end);
      return publish(start, end, results);
    },
    getDelegates: () => [],
  });
}
