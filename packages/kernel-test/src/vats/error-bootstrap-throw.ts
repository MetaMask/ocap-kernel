import { makeDefaultExo } from '@metamask/kernel-utils/exo';

// eslint-disable-next-line no-console
console.log('bootstrap throw');

/**
 * Build function for vats that will throw an error during bootstrap.
 *
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject() {
  // eslint-disable-next-line no-console
  console.log('buildRootObject');
  return makeDefaultExo('root', {
    bootstrap: () => {
      // eslint-disable-next-line no-console
      console.log('bootstrap');
      throw new Error('from bootstrap');
    },
  });
}
