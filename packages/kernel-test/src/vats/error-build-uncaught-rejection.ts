import { makePromiseKit } from '@endo/promise-kit';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

// eslint-disable-next-line no-console
console.log('build uncaught rejection');

/**
 * Build function for vats that will reject a promise during buildRootObject.
 *
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject() {
  // eslint-disable-next-line no-console
  console.log('buildRootObject');

  const { reject } = makePromiseKit();
  reject('from buildRootObject');

  return makeDefaultExo('root', {
    bootstrap: () => {
      // eslint-disable-next-line no-console
      console.log('bootstrap');
    },
  });
}
