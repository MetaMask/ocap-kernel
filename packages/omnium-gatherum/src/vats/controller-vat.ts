import { E } from '@endo/eventual-send';
import type { ERef } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import type { PromiseKit } from '@endo/promise-kit';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Logger } from '@metamask/logger';
import type { ClusterConfig } from '@metamask/ocap-kernel';

import { makeBaggageStorageAdapter } from './storage/baggage-adapter.ts';
import type { Baggage } from './storage/baggage-adapter.ts';
import { CapletController } from '../controllers/caplet/caplet-controller.ts';
import type {
  CapletControllerFacet,
  LaunchResult,
} from '../controllers/caplet/index.ts';

/**
 * Vat powers provided to the bootstrap vat.
 */
type VatPowers = {
  logger?: Logger;
};

/**
 * Kernel facet interface for system vat operations.
 */
type KernelFacet = {
  launchSubcluster: (config: ClusterConfig) => Promise<LaunchResult>;
  terminateSubcluster: (subclusterId: string) => Promise<void>;
  getVatRoot: (krefString: string) => Promise<unknown>;
};

/**
 * Services provided to the bootstrap vat.
 */
type BootstrapServices = {
  kernelFacet?: KernelFacet;
};

/**
 * Bootstrap vat for Omnium system services.
 * Hosts controllers with baggage-backed persistence.
 *
 * Methods are exposed directly on root (not nested) for queueMessage access.
 *
 * @param vatPowers - Special powers granted to this vat.
 * @param _parameters - Initialization parameters (unused).
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the new vat.
 */
export function buildRootObject(
  vatPowers: VatPowers,
  _parameters: unknown,
  baggage: Baggage,
): object {
  const vatLogger = vatPowers.logger?.subLogger({ tags: ['bootstrap'] });
  const logger = vatLogger ?? console;

  // Create baggage-backed storage adapter
  const storageAdapter = makeBaggageStorageAdapter(baggage);

  // Promise kit for the caplet controller facet, resolved in bootstrap()
  const {
    promise: capletFacetP,
    resolve: resolveCapletFacet,
  }: PromiseKit<CapletControllerFacet> =
    makePromiseKit<CapletControllerFacet>();

  // Define delegating methods for caplet operations
  const capletMethods = defineMethods(capletFacetP, [
    'install',
    'uninstall',
    'list',
    'get',
    'getCapletRoot',
  ]);

  return makeDefaultExo('omnium-controllers', {
    /**
     * Initialize the bootstrap vat with services from the kernel.
     *
     * @param _vats - Other vats in this subcluster (unused).
     * @param services - Services provided by the kernel.
     */
    async bootstrap(
      _vats: unknown,
      services: BootstrapServices,
    ): Promise<void> {
      logger?.info('Bootstrap called');

      const { kernelFacet } = services;
      if (!kernelFacet) {
        throw new Error('kernelFacet service is required');
      }

      // Initialize caplet controller with baggage-backed storage
      const capletFacet = await CapletController.make(
        { logger: vatLogger?.subLogger({ tags: ['caplet'] }) },
        {
          adapter: storageAdapter,
          launchSubcluster: async (
            config: ClusterConfig,
          ): Promise<LaunchResult> => {
            const result = await E(kernelFacet).launchSubcluster(config);
            return {
              subclusterId: result.subclusterId,
              rootKref: result.rootKref,
            };
          },
          terminateSubcluster: async (subclusterId: string): Promise<void> =>
            E(kernelFacet).terminateSubcluster(subclusterId),
          getVatRoot: async (krefString: string): Promise<unknown> =>
            E(kernelFacet).getVatRoot(krefString),
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
 * @param source - The source object (or promise) to delegate to.
 * @param methodNames - Array of method names to delegate.
 * @returns An object with delegating methods.
 */
function defineMethods(
  source: ERef<object>,
  methodNames: string[],
): Record<string, (...args: unknown[]) => unknown> {
  const output: Record<string, (...args: unknown[]) => unknown> = {};
  for (const methodName of methodNames) {
    output[methodName] = (...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (E(source) as any)[methodName](...args);
  }
  return output;
}
