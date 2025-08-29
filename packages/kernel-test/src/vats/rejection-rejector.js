import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * This vat is used to test that throwing from a remotable method rejects the
 * result.
 *
 * @param {object} vatPowers - The vat powers.
 * @param {object} vatPowers.logger - The logger for this vat.
 * @returns {object} The root object for this vat.
 */
export function buildRootObject({ logger }) {
  const { log } = logger.subLogger({ tags: ['test'] });
  return makeDefaultExo('root', {
    async foo(reject) {
      if (reject) {
        log('reject');
        throw new Error('error: bar');
      }
      log('resolve');
      return 'bar';
    },
  });
}
