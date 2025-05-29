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
 * @returns {object} The root object of the vat.
 */
export function buildRootObject() {
  // Mutable state with default values can be declared here as let variables.
  let name = 'world';

  // The root object is passed to 'Far' since it must be accessed remotely.
  return Far('root', {
    setName(newName) {
      name = newName;
    },
    hello() {
      return `Hello, ${name}!`;
    },
    goodbye() {
      return `Goodbye, ${name}!`;
    },
  });
}
