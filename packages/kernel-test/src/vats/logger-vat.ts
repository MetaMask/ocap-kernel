import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { VatPowers } from '@metamask/ocap-kernel';

/**
 * Build function for vats that will run various tests.
 *
 * @param vatPowers - Special powers granted to this vat.
 * @param vatPowers.logger - The logger for the vat.
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @param _baggage - Root of vat's persistent state (not used here).
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: VatPowers,
  parameters: { name?: string } = {},
  _baggage: unknown = null,
) {
  const name = parameters?.name ?? 'anonymous';
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });

  return makeDefaultExo('root', {
    bootstrap() {
      // do nothing
    },
    foo() {
      logger.log(`foo: ${name}`);
      // eslint-disable-next-line no-console
      console.log(`bar: ${name}`);
    },
  });
}
