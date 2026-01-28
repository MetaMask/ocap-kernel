import type { CapData } from '@endo/marshal';
import { makeDefaultExo } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';

import { kslot } from '../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../liveslots/kernel-marshal.ts';
import type {
  KRef,
  ClusterConfig,
  Subcluster,
  KernelStatus,
} from '../types.ts';

/**
 * Dependencies required by KernelFacetService.
 */
export type KernelFacetDependencies = {
  launchSubcluster: (config: ClusterConfig) => Promise<{
    subclusterId: string;
    bootstrapRootKref: KRef;
    bootstrapResult: CapData<KRef> | undefined;
  }>;
  terminateSubcluster: (subclusterId: string) => Promise<void>;
  reloadSubcluster: (subclusterId: string) => Promise<Subcluster>;
  getSubcluster: (subclusterId: string) => Subcluster | undefined;
  getSubclusters: () => Subcluster[];
  getStatus: () => Promise<KernelStatus>;
  logger?: Logger;
};

/**
 * Result of launching a subcluster via the kernel facet.
 * Contains the root object as a slot value (which will become a presence).
 */
export type KernelFacetLaunchResult = {
  subclusterId: string;
  root: SlotValue;
};

/**
 * Creates a kernel facet service object that provides privileged kernel
 * operations to system subclusters.
 *
 * The kernel facet is provided as a vatpower to the bootstrap vat of a
 * system subcluster. It enables the bootstrap vat to:
 * - Launch dynamic subclusters (and receive E()-callable presences)
 * - Terminate subclusters
 * - Reload subclusters
 * - Query kernel status
 *
 * @param deps - Dependencies for the kernel facet service.
 * @returns The kernel facet service object.
 */
export function makeKernelFacetService(deps: KernelFacetDependencies): object {
  const {
    launchSubcluster,
    terminateSubcluster,
    reloadSubcluster,
    getSubcluster,
    getSubclusters,
    getStatus,
    logger,
  } = deps;

  const kernelFacet = makeDefaultExo('kernelFacet', {
    /**
     * Launch a dynamic subcluster.
     *
     * @param config - Configuration for the subcluster.
     * @returns A promise for the launch result containing subclusterId and root presence.
     */
    async launchSubcluster(
      config: ClusterConfig,
    ): Promise<KernelFacetLaunchResult> {
      logger?.log(`kernelFacet: launching subcluster`, config.bootstrap);
      const result = await launchSubcluster(config);
      logger?.log(
        `kernelFacet: launched subcluster ${result.subclusterId} with root ${result.bootstrapRootKref}`,
      );

      // Convert the kref to a slot value that will become a presence
      // when marshalled/delivered to the system vat
      return {
        subclusterId: result.subclusterId,
        root: kslot(result.bootstrapRootKref, 'vatRoot'),
      };
    },

    /**
     * Terminate a subcluster.
     *
     * @param subclusterId - ID of the subcluster to terminate.
     */
    async terminateSubcluster(subclusterId: string): Promise<void> {
      logger?.log(`kernelFacet: terminating subcluster ${subclusterId}`);
      await terminateSubcluster(subclusterId);
      logger?.log(`kernelFacet: terminated subcluster ${subclusterId}`);
    },

    /**
     * Reload a subcluster by terminating and relaunching all its vats.
     *
     * @param subclusterId - ID of the subcluster to reload.
     * @returns The reloaded subcluster information.
     */
    async reloadSubcluster(subclusterId: string): Promise<Subcluster> {
      logger?.log(`kernelFacet: reloading subcluster ${subclusterId}`);
      const result = await reloadSubcluster(subclusterId);
      logger?.log(`kernelFacet: reloaded subcluster, new id: ${result.id}`);
      return result;
    },

    /**
     * Get information about a specific subcluster.
     *
     * @param subclusterId - ID of the subcluster to query.
     * @returns The subcluster information or undefined if not found.
     */
    getSubcluster(subclusterId: string): Subcluster | undefined {
      return getSubcluster(subclusterId);
    },

    /**
     * Get information about all subclusters.
     *
     * @returns Array of all subcluster information records.
     */
    getSubclusters(): Subcluster[] {
      return getSubclusters();
    },

    /**
     * Get the current kernel status.
     *
     * @returns A promise for the kernel status.
     */
    async getStatus(): Promise<KernelStatus> {
      return getStatus();
    },
  });

  return kernelFacet;
}
