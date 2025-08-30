import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for vats that will run various tests.
 *
 * @param {*} vatPowers - Special powers granted to this vat.
 * @param {*} parameters - Initialization parameters from the vat's config object.
 * @param {*} _baggage - Root of vat's persistent state (not used here).
 * @returns {*} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, _baggage) {
  const name = parameters?.name ?? 'anonymous';
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });

  return makeDefaultExo('root', {
    bootstrap() {
      // do nothing
    },
    foo() {
      logger.log(`foo: ${name}`);
      console.log(`bar: ${name}`);
    },
  });
}
