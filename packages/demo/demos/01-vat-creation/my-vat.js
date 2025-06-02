/**
 * Example 01: A simple vat with a mutable state.
 * ----------
 * This example shows how to create a vat with a mutable state.
 *
 * The vat entrypoint script exports a buildRootObject function.
 * The returned object declares the vat's public API.
 */

// 'Far' is used to explicitly mark that an object is allowed to exit the vat.
import { Far } from '@endo/far';

/**
 * This function is called by the ocap kernel to build the vat's root object.
 *
 * @param {unknown} _ - Unused.
 * @param {object} parameters - The parameters passed to the vat.
 * @param {string} parameters.name - The name to say hello to.
 * @returns {object} The root object of the vat.
 */
export function buildRootObject(_, { name = 'world' }) {
  // The root object is passed to 'Far' since it must be accessed remotely.
  return Far('root', {
    hello() {
      return `Hello, ${name}!`;
    },
    goodbye() {
      return `Goodbye, ${name}!`;
    },
  });
}
