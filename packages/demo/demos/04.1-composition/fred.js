/**
 * Example 04: Introductions.
 * --------------------------
 * This vat is 'fooable' -- its root object declares a foo method that returns
 * a string. The bar method of bob depends upon some fooable object. The
 * introducer vat passes this one by reference to bob at bootstrap time.
 *
 * @see bob.js for the vat that depends upon this one.
 * @see introducer.js for the vat that introduces fred to bob.
 */

import { Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    foo() {
      return 'foo';
    },
  });
}
