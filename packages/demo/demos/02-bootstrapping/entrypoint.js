/**
 * Example 02: Bootstrapping a vat.
 * ----------
 * This example shows how to bootstrap a vat.
 *
 * The vat entrypoint script exports a buildRootObject function.
 * The returned object declares the vat's public API.
 */

import { E, Far } from '@endo/far';

/**
 * This function is called by the ocap kernel to build the vat's root object.
 *
 * @returns {object} The root object of the vat.
 */
export function buildRootObject() {
  return Far('root', {
    async bootstrap(vats) {
      await E(vats.target).hello();
      const name = await E(vats.target).getName();
      await E(vats.target).setName(`0x${name}`);
      await E(vats.target).goodbye();
      return 'Success!';
    },
  });
}
