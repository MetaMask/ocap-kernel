import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

console.log('bootstrap uncaught rejection');

/**
 * Build function for vats that will reject a promise during bootstrap.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject() {
  console.log('buildRootObject');
  return Far('root', {
    bootstrap: () => {
      console.log('bootstrap');
      const { reject } = makePromiseKit();
      reject('from bootstrap');
    },
  });
}
