import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a persistent worker vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'Worker';
  const id = parameters?.id ?? 0;
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });
  const tlog = (message) => logger.log(`${name}: ${message}`);

  let workCount;

  if (baggage.has('workCount')) {
    // Resume from persistent state
    workCount = baggage.get('workCount');
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
