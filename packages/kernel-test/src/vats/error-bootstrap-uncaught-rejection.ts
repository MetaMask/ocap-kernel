import { makePromiseKit } from '@endo/promise-kit';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

console.log('bootstrap uncaught rejection');

/**
 * Build function for vats that will reject a promise during bootstrap.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject() {
  console.log('buildRootObject');
  return makeDefaultExo('root', {
    bootstrap: () => {
      console.log('bootstrap');
      const { reject } = makePromiseKit();
      reject('from bootstrap');
    },
  });
}
