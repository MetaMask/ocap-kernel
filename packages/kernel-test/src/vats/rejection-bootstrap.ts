import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type { TestPowers } from '../test-powers.ts';

/**
 * This vat is used to test that throwing from a remotable method rejects the
 * result.
 *
 * @param vatPowers - The vat powers.
 * @param vatPowers.logger - The logger for this vat.
 * @returns The root object for this vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject({ logger }: TestPowers) {
  const { log } = logger.subLogger({ tags: ['test'] });
  return makeDefaultExo('root', {
    async bootstrap({ rejector }: { rejector: unknown }) {
      await E(rejector).foo(false).then(log);
      await E(rejector)
        .foo(true)
        .catch(() => log('err'));
      await E(rejector).foo(false).then(log);
    },
  });
}
