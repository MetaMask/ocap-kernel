import { Far } from '@endo/marshal';

console.log('bootstrap throw');

/**
 * Build function for vats that will throw an error during bootstrap.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject() {
  console.log('buildRootObject');
  return Far('root', {
    bootstrap: () => {
      console.log('bootstrap');
      throw new Error('from bootstrap');
    },
  });
}
