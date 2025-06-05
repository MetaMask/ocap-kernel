/**
 * Example 04: Introductions.
 * --------------------------
 * The cluster config declares the vats bob and fred, but they have no
 * knowledge of one another. So that bob can depend upon fred, the introducer
 * vat passes bob a reference to fred at bootstrap time.
 *
 * @see bob.js for the vat that depends upon fred.
 * @see fred.js for the vat that bob depends upon.
 */

import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    async bootstrap({ bob, fred }) {
      await E(bob).bar(fred).then(console.log);
    },
  });
}
