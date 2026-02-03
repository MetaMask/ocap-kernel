import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage, VatPowers } from '@metamask/ocap-kernel';

/**
 * Build function for a persistent worker vat.
 *
 * @param vatPowers - Special powers granted to this vat.
 * @param vatPowers.logger - The logger for the vat.
 * @param parameters - Initialization parameters from the vat's config object.
 * @param parameters.name - The name of the vat.
 * @param parameters.id - The worker ID.
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the new vat.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: VatPowers,
  parameters: { name?: string; id?: number },
  baggage: Baggage,
) {
  const name = parameters?.name ?? 'Worker';
  const id = parameters?.id ?? 0;
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });
  const tlog = (message: string): void => logger.log(`${name}: ${message}`);

  let workCount: number;

  if (baggage.has('workCount')) {
    // Resume from persistent state
    workCount = baggage.get('workCount') as number;
    tlog(`resumed with work count: ${workCount}`);
  } else {
    // Initialize new worker
    workCount = 0;
    baggage.init('workCount', workCount);
    tlog(`initialized with id: ${id}`);
  }

  return makeDefaultExo('worker', {
    async bootstrap() {
      tlog(`bootstrap called`);
      return `Worker${id} initialized`;
    },

    async resume() {
      tlog(`resume called`);
      // Do work when resume is called
      workCount += 1;
      baggage.set('workCount', workCount);
      tlog(`did work, count: ${workCount}`);
      return `Worker${id}(${workCount})`;
    },
  });
}
