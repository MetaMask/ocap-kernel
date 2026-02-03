import { makeDefaultExo } from '@metamask/kernel-utils/exo';

console.log('bootstrap throw');

/**
 * Build function for vats that will throw an error during bootstrap.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject() {
  console.log('buildRootObject');
  return makeDefaultExo('root', {
    bootstrap: () => {
      console.log('bootstrap');
      throw new Error('from bootstrap');
    },
  });
}
