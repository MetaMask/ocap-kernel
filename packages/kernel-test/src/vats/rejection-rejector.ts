import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { VatPowers } from '@metamask/ocap-kernel';

/**
 * This vat is used to test that throwing from a remotable method rejects the
 * result.
 *
 * @param vatPowers - The vat powers.
 * @param vatPowers.logger - The logger for this vat.
 * @returns The root object for this vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject({ logger }: VatPowers) {
  const { log } = logger.subLogger({ tags: ['test'] });
  return makeDefaultExo('root', {
    async foo(reject: boolean) {
      if (reject) {
        log('reject');
        throw new Error('error: bar');
      }
      log('resolve');
      return 'bar';
    },
  });
}
