import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a simple counter vat.
 *
 * @param {object} _vatPowers - Special powers granted to this vat.
 * @param {object} parameters - Initialization parameters from the vat's config.
 * @param {object} baggage - Root of vat's persistent state.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject(_vatPowers, parameters, baggage) {
  const { name = 'Counter' } = parameters;

  // Initialize counter in baggage if not present
  if (!baggage.has('count')) {
    baggage.init('count', 0);
    console.log(`${name}: Initialized counter to 0`);
  } else {
    console.log(`${name}: Counter already exists with value ${baggage.get('count')}`);
  }

  return makeDefaultExo('root', {
    /**
     * Bootstrap method called when the vat is first launched.
     *
     * @returns {string} Bootstrap completion message.
     */
    bootstrap() {
      const count = baggage.get('count');
      console.log(`${name}: bootstrap() - current count: ${count}`);
      return `${name} initialized with count: ${count}`;
    },

    /**
     * Increment the counter and return the new value.
     *
     * @param {number} amount - Amount to increment by (default: 1).
     * @returns {number} The new counter value.
     */
    increment(amount = 1) {
      const oldCount = baggage.get('count');
      const newCount = oldCount + amount;
      baggage.set('count', newCount);
      console.log(`${name}: Incremented from ${oldCount} to ${newCount}`);
      return newCount;
    },

    /**
     * Get the current counter value.
     *
     * @returns {number} The current counter value.
     */
    getCount() {
      const count = baggage.get('count');
      console.log(`${name}: getCount() - current count: ${count}`);
      return count;
    },

    /**
     * Reset the counter to zero.
     *
     * @returns {number} The new counter value (0).
     */
    reset() {
      baggage.set('count', 0);
      console.log(`${name}: Counter reset to 0`);
      return 0;
    },
  });
}

