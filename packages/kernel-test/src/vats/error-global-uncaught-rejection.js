import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';

console.log('global uncaught rejection');

const { reject } = makePromiseKit();

reject('from global scope');

/**
 * Build function for vats that will reject a promise in global scope.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject() {
  return Far('root', { bootstrap: () => console.log('bootstrap') });
}
