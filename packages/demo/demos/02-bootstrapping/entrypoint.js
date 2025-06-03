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
      const { target } = vats;
      // Say hello with the target vat's default name.
      await E(target).hello().then(console.log);
      // Flip the target vat's name around.
      const name = await E(target).getName();
      await E(target).setName(name.split('').reverse().join(''));
      // Say goodbye with the target vat's new name.
      await E(target).goodbye().then(console.log);
    },
  });
}
