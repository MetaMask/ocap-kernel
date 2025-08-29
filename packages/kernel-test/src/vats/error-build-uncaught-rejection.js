import { makePromiseKit } from '@endo/promise-kit';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

console.log('build uncaught rejection');

/**
 * Build function for vats that will reject a promise during buildRootObject.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject() {
  console.log('buildRootObject');

  const { reject } = makePromiseKit();
  reject('from buildRootObject');

  return makeDefaultExo('root', {
    bootstrap: () => {
      console.log('bootstrap');
    },
  });
}
