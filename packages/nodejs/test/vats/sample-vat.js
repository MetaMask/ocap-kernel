import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a sample vat.
 *
 * @param {object} _ - The vat powers (unused).
 * @param {object} params - The vat parameters.
 * @param {string} params.name - The name of the vat. Defaults to 'unknown'.
 *
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject(_, { name = 'unknown' }) {
  return makeDefaultExo('root', {
    bootstrap: () => {
      console.log(`bootstrap ${name}`);
    },
  });
}
