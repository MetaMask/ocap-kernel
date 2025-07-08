import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

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

  return Far('root', {
    bootstrap: () => {
      console.log('bootstrap');
    },
  });
}
