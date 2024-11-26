/**
 * Start function for storage vat.
 *
 * @param {unknown} parameters - Initialization parameters from the vat's config object.
 * @param {object} options - Additional options.
 * @param {Baggage} options.baggage - The baggage to use for storage.
 * @param {Function} options.provideObject - The function to use to provide objects.
 * @param {Function} options.provideCollection - The function to use to provide collections.
 * @returns {unknown} The root object for the new vat.
 */
export function start(
  parameters,
  { baggage, provideObject, provideCollection },
) {
  const name = parameters?.name ?? 'anonymous';
  console.log(`start vat root object "${name}"`);

  // Initialize our persistent state
  const state = provideObject(baggage, 'state', {
    initialized: Date.now(),
    lastAccessed: null,
  });

  // Create a collection for storing key-value pairs
  const store = provideCollection(baggage, 'store');

  return {
    name,

    async set(key, value) {
      await store.init(key, value);
      state.lastAccessed = Date.now();
      return true;
    },

    async get(key) {
      const value = await store.get(key);
      state.lastAccessed = Date.now();
      return value;
    },

    async delete(key) {
      await store.delete(key);
      state.lastAccessed = Date.now();
      return true;
    },

    getStats() {
      return {
        initialized: state.initialized,
        lastAccessed: state.lastAccessed,
      };
    },
  };
}
