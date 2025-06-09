/**
 * Example 02: Bootstrapping.
 * --------------------------
 * This example shows how to bootstrap a cluster. This vat's root object has
 * the bootstrap method.
 *
 * @see target.js for the vat that exports the remotable object.
 * @see cluster.json to see how this vat is declared the cluster bootstrapper.
 */

import { E, Far } from '@endo/far';

export function buildRootObject() {
  return Far('root', {
    /**
     * The bootstrap method is called by the ocap kernel when the cluster is
     * started. It is passed a vats object which is a record of the root objects
     * of all the vats in the cluster.
     *
     * @param {object} vats - The vats object.
     * @param {object} vats.target - The target vat.
     */
    async bootstrap({ target }) {
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
