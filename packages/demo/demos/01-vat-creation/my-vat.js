/**
 * Example 01: Vat creation.
 * -------------------------
 * This example shows how to create a vat. This vat's root object declares
 * a hello and goodbye method with outputs that depend on the name parameter.
 *
 * For a js file to become a vat, it must export a buildRootObject function.
 * The ocap kernel will call this function to build the vat's root object,
 * which is a remotable object that provides the vat's initial capabilities.
 *
 * Additional capabilities can be exported from the vat at runtime, and
 * other vats generally access only a limited facet of the root object.
 */

// 'Far' is used to explicitly mark that an object is allowed to exit the vat.
import { Far } from '@endo/far';

/**
 * This function is called by the ocap kernel to build the vat's root object.
 *
 * @param {unknown} _ - Unused.
 * @param {object} parameters - The parameters passed to the vat.
 * @param {string} parameters.name - The name to say hello and goodbye to.
 * @returns {object} The vat's root object.
 */
export function buildRootObject(_, { name = 'world' }) {
  // The root object is passed through 'Far' to mark it as remotable.
  return Far('root', {
    hello: () => `Hello, ${name}!`,
    goodbye: () => `Goodbye, ${name}!`,
  });
}
