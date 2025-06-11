/**
 * Example 04: Introductions.
 * --------------------------
 * This vat's root object declares a bar method that depends upon a fooable
 * vat. Fred is 'fooable', and the introducer vat passes this one a reference
 * to fred at bootstrap time.
 *
 * @see fred.js for the 'fooable' vat that bob depends upon.
 * @see introducer.js for the vat that introduces fred to bob.
 */

import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bar(fooable) {
      return `${await E(fooable).foo()} : bar`;
    },
  });
}
