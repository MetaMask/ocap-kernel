/* global harden */
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

/**
 * Build function for a persistent coordinator vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'Coordinator';
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });
  const tlog = (message) => logger.log(`${name}: ${message}`);

  let workCount;
  let workers;

  if (baggage.has('workCount')) {
    workCount = baggage.get('workCount');
    workers = baggage.get('workers');
    tlog(`resumed with work count: ${workCount}`);
  } else {
    workCount = 0;
    workers = {};
    baggage.init('workCount', workCount);
    tlog(`initialized`);
  }

  return Far('coordinator', {
    async bootstrap(vats) {
      tlog(`bootstrap called`);
      if (!baggage.has('workers')) {
        // Store worker references for persistence
        workers = {
          worker1: vats.worker1,
          worker2: vats.worker2,
        };
        baggage.init('workers', harden(workers));
        tlog(`stored ${Object.keys(workers).length} workers`);
      }
      return `Coordinator initialized with ${Object.keys(workers).length} workers`;
    },

    async resume() {
      tlog(`resume called`);
      if (!workers || !workers.worker1 || !workers.worker2) {
        tlog(`no workers available`);
        return `No workers available`;
      }
      const [result1, result2] = await Promise.all([
        E(workers.worker1).resume(),
        E(workers.worker2).resume(),
      ]);
      workCount += 1;
      baggage.set('workCount', workCount);
      const message = `Work completed: ${result1}, ${result2}`;
      tlog(message);
      return message;
    },
  });
}
