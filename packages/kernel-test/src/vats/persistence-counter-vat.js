import { Far } from '@endo/marshal';

/**
 * Build function for a persistent counter vat.
 *
 * @param {unknown} vatPowers - Special powers granted to this vat.
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {unknown} baggage - Root of vat's persistent state.
 * @returns {unknown} The root object for the new vat.
 */
export function buildRootObject(vatPowers, parameters, baggage) {
  const name = parameters?.name ?? 'Counter';
  const logger = vatPowers.logger.subLogger({ tags: ['test'] });
  const tlog = (message) => logger.log(`${name}: ${message}`);

  let count;
  if (baggage.has('count')) {
    // Resume from persistent state
    count = baggage.get('count');
    tlog(`resumed with count: ${count}`);
  } else {
    // Initialize new counter
    count = 1;
    baggage.init('count', count);
    tlog(`initialized with count: ${count}`);
  }

  return Far('counter', {
    async bootstrap() {
      tlog(`bootstrap called`);
      return `Counter initialized with count: ${count}`;
    },

    async resume() {
      tlog(`resume called`);
      // Increment the counter when resume is called
      count += 1;
      baggage.set('count', count);
      tlog(`incremented to: ${count}`);
      return `Counter incremented to: ${count}`;
    },
  });
}
