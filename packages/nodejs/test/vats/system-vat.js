import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

/**
 * Build function for a test system vat that uses kernel services.
 *
 * @param {object} _ - The vat powers (unused).
 * @param {object} params - The vat parameters.
 * @param {string} params.name - The name of the vat. Defaults to 'system-vat'.
 * @param {object} baggage - The vat's persistent baggage storage.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject(_, { name = 'system-vat' }, baggage) {
  let kernelFacet;

  return makeDefaultExo('root', {
    /**
     * Bootstrap the system vat.
     *
     * @param {object} _vats - The vats object (unused).
     * @param {object} services - The services object.
     */
    async bootstrap(_vats, services) {
      console.log(`system vat ${name} bootstrap`);
      kernelFacet = services.kernelFacet;
    },

    /**
     * Check if the kernel facet was received during bootstrap.
     *
     * @returns {boolean} True if kernelFacet is defined.
     */
    hasKernelFacet() {
      return kernelFacet !== undefined;
    },

    /**
     * Get the kernel status via the kernel facet.
     *
     * @returns {Promise<object>} The kernel status.
     */
    async getKernelStatus() {
      return E(kernelFacet).getStatus();
    },

    /**
     * Get all subclusters via the kernel facet.
     *
     * @returns {Promise<object[]>} The list of subclusters.
     */
    async getSubclusters() {
      return E(kernelFacet).getSubclusters();
    },

    /**
     * Launch a subcluster via the kernel facet.
     *
     * @param {object} config - The cluster configuration.
     * @returns {Promise<object>} The launch result.
     */
    async launchSubcluster(config) {
      return E(kernelFacet).launchSubcluster(config);
    },

    /**
     * Terminate a subcluster via the kernel facet.
     *
     * @param {string} subclusterId - The ID of the subcluster to terminate.
     * @returns {Promise<void>}
     */
    async terminateSubcluster(subclusterId) {
      return E(kernelFacet).terminateSubcluster(subclusterId);
    },

    /**
     * Store a value in the baggage.
     *
     * @param {string} key - The key to store the value under.
     * @param {unknown} value - The value to store.
     */
    storeToBaggage(key, value) {
      if (baggage.has(key)) {
        baggage.set(key, value);
      } else {
        baggage.init(key, value);
      }
    },

    /**
     * Retrieve a value from the baggage.
     *
     * @param {string} key - The key to retrieve.
     * @returns {unknown} The stored value, or undefined if not found.
     */
    getFromBaggage(key) {
      return baggage.has(key) ? baggage.get(key) : undefined;
    },

    /**
     * Check if a key exists in the baggage.
     *
     * @param {string} key - The key to check.
     * @returns {boolean} True if the key exists in baggage.
     */
    hasBaggageKey(key) {
      return baggage.has(key);
    },
  });
}
