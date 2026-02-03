import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import { makeBaggageStorageAdapter } from './storage/baggage-adapter.ts';
import { CapletController } from '../controllers/caplet/caplet-controller.ts';

/**
 * Bootstrap vat for Omnium system services.
 * Hosts controllers with baggage-backed persistence.
 *
 * Methods are exposed directly on root (not nested) for queueMessage access.
 *
 * @param {object} vatPowers - Special powers granted to this vat.
 * @param {object} _parameters - Initialization parameters (unused).
 * @param {object} baggage - Root of vat's persistent state.
 * @returns {object} The root object for the new vat.
 */
export function buildRootObject(vatPowers, _parameters, baggage) {
  const logger =
    vatPowers.logger?.subLogger({ tags: ['bootstrap'] }) ?? console;

  // Create baggage-backed storage adapter
  const storageAdapter = makeBaggageStorageAdapter(baggage);

  // Promise kit for the caplet controller facet, resolved in bootstrap()
  /** @type {import('@endo/promise-kit').PromiseKit<import('../controllers/caplet/caplet-controller.ts').CapletControllerFacet>} */
  const { promise: capletFacetP, resolve: resolveCapletFacet } =
    makePromiseKit();

  // Define delegating methods for caplet operations
  const capletMethods = defineMethods(capletFacetP, {
    installCaplet: 'install',
    uninstallCaplet: 'uninstall',
    listCaplets: 'list',
    getCaplet: 'get',
    getCapletRoot: 'getCapletRoot',
  });

  return makeDefaultExo('omnium-bootstrap', {
    /**
     * Initialize the bootstrap vat with services from the kernel.
     *
     * @param {object} _vats - Other vats in this subcluster (unused).
     * @param {object} services - Services provided by the kernel.
     */
    async bootstrap(_vats, services) {
      logger?.info('Bootstrap called');

      const { kernelFacet } = services;
      if (!kernelFacet) {
        throw new Error('kernelFacet service is required');
      }

      // Initialize caplet controller with baggage-backed storage
      const capletFacet = await CapletController.make(
        { logger: logger?.subLogger({ tags: ['caplet'] }) },
        {
          adapter: storageAdapter,
          launchSubcluster: async (config) => {
            const result = await E(kernelFacet).launchSubcluster(config);
            return {
              subclusterId: result.subclusterId,
              rootKref: result.rootKref,
            };
          },
          terminateSubcluster: (subclusterId) =>
            E(kernelFacet).terminateSubcluster(subclusterId),
          getVatRoot: (krefString) => E(kernelFacet).getVatRoot(krefString),
        },
      );
      resolveCapletFacet(capletFacet);

      logger?.info('Bootstrap complete');
    },

    ...capletMethods,
  });
}

/**
 * Create delegating methods that forward calls to a source object via E().
 * Useful for exposing methods from a promise-based source on an exo.
 *
 * @param {object | Promise<object>} source - The source object (or promise) to delegate to.
 * @param {Record<string, string>} methodMap - Maps exposed method names to source method names.
 * @returns {Record<string, (...args: unknown[]) => unknown>} An object with delegating methods.
 */
function defineMethods(source, methodMap) {
  const output = {};
  for (const [exposedName, sourceName] of Object.entries(methodMap)) {
    output[exposedName] = (...args) => E(source)[sourceName](...args);
  }
  return output;
}
