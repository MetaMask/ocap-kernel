/**
 * Example 02: Bootstrapping.
 * --------------------------
 * This example shows how to bootstrap a cluster. This vat's root object
 * declares a hello and goodbye method that use a mutable name.
 *
 * @see entrypoint.js for the vat that bootstraps the cluster.
 * @see cluster.json for the target vat's initial name.
 */

import { Far } from '@endo/far';

/**
 * This function is called by the ocap kernel to build the vat's root object.
 *
 * @param {unknown} _ - Unused.
 * @param {object} parameters - The parameters passed to the vat.
 * @param {string} parameters.name - The initial name of the vat.
 * @returns {object} The root object of the vat.
 */
export function buildRootObject(_, { name = 'world' }) {
  let currentName = name;

  return Far('root', {
    hello: () => `Hello, ${currentName}!`,
    goodbye: () => `Goodbye, ${currentName}!`,
    getName: () => currentName,
    setName: (newName) => (currentName = newName),
  });
}
