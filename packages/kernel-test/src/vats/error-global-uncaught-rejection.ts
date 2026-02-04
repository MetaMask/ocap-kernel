import { makePromiseKit } from '@endo/promise-kit';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

// eslint-disable-next-line no-console
console.log('global uncaught rejection');

const { reject } = makePromiseKit();

reject('from global scope');

/**
 * Build function for vats that will reject a promise in global scope.
 *
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject() {
  // eslint-disable-next-line no-console
  return makeDefaultExo('root', { bootstrap: () => console.log('bootstrap') });
}
