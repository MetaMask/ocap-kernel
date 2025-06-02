/**
 * Example 01: A simple vat with a mutable state.
 * ----------
 * This example shows how to create a vat with a mutable state.
 *
 * The vat entrypoint script exports a buildRootObject function.
 * The returned object declares the vat's public API.
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
    hello() {
      return `Hello, ${currentName}!`;
    },
    goodbye() {
      return `Goodbye, ${currentName}!`;
    },
    getName() {
      return currentName;
    },
    setName(newName) {
      currentName = newName;
    },
  });
}
