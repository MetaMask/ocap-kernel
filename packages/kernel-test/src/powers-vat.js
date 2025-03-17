import { Far } from '@endo/marshal';

/**
 * Build function for running a test of the vatstore.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat (not used here).
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} _baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const name = parameters?.bar ?? 'anonymous';
  console.log(`buildRootObject "${name}"`);

  return Far('root', {
    async bootstrap(_) {
      console.log(`vat ${name} is bootstrap`);
      await vatPowers.foo(parameters.bar);
    },
  });
}
