import { makeDefaultExo } from '@metamask/kernel-utils';

import type { Kernel } from './Kernel.ts';
import { kslot } from './liveslots/kernel-marshal.ts';
import type { SlotValue } from './liveslots/kernel-marshal.ts';
import type { ClusterConfig, Subcluster, KernelStatus } from './types.ts';

/**
 * Dependencies required to create a kernel facet.
 */
export type KernelFacetDependencies = Pick<
  Kernel,
  | 'launchSubcluster'
  | 'terminateSubcluster'
  | 'reloadSubcluster'
  | 'getSubcluster'
  | 'getSubclusters'
  | 'getStatus'
>;

/**
 * Result of launching a subcluster via the kernel facet.
 * Contains the root object as a slot value (which will become a presence)
 * and the root kref string for storage purposes.
 */
export type KernelFacetLaunchResult = {
  /** The ID of the launched subcluster. */
  subclusterId: string;
  /**
   * The root object as a slot value (becomes a presence when marshalled).
   * Use this directly with E() for immediate operations.
   */
  root: SlotValue;
  /**
   * The root kref string for storage purposes.
   * Store this value to restore the presence after restart using getSubclusterRoot().
   */
  rootKref: string;
};

/**
 * The kernel facet interface.
 *
 * This is the interface provided as a vatpower to the bootstrap vat of a
 * system vat. It enables privileged kernel operations.
 *
 * Derived from KernelFacetDependencies but with launchSubcluster overridden
 * to return KernelFacetLaunchResult (root as SlotValue) instead of
 * SubclusterLaunchResult (bootstrapRootKref as string).
 */
export type KernelFacet = Omit<
  KernelFacetDependencies,
  'logger' | 'launchSubcluster'
> & {
  /**
   * Launch a dynamic subcluster.
   * Returns root as a SlotValue (which becomes a presence when delivered).
   *
   * @param config - Configuration for the subcluster.
   * @returns A promise for the launch result containing subclusterId and root presence.
   */
  launchSubcluster: (config: ClusterConfig) => Promise<KernelFacetLaunchResult>;

  /**
   * Convert a kref string to a slot value (presence).
   *
   * Use this to restore a presence from a stored kref string after restart.
   *
   * @param kref - The kref string to convert.
   * @returns The slot value that will become a presence when marshalled.
   */
  getVatRoot: (kref: string) => SlotValue;
};

/**
 * Creates a kernel facet object that provides privileged kernel operations.
 *
 * The kernel facet is provided as a vatpower to the bootstrap vat of a
 * system vat. It enables the bootstrap vat to:
 * - Launch dynamic subclusters (and receive E()-callable presences)
 * - Terminate subclusters
 * - Reload subclusters
 * - Query kernel status
 *
 * @param deps - Dependencies for creating the kernel facet.
 * @returns The kernel facet object.
 */
export function makeKernelFacet(deps: KernelFacetDependencies): KernelFacet {
  const {
    launchSubcluster,
    terminateSubcluster,
    reloadSubcluster,
    getSubcluster,
    getSubclusters,
    getStatus,
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
      const result = await launchSubcluster(config);
      return {
        subclusterId: result.subclusterId,
        root: kslot(result.bootstrapRootKref, 'vatRoot'),
        rootKref: result.bootstrapRootKref,
      };
    },

    /**
     * Terminate a subcluster.
     *
     * @param subclusterId - ID of the subcluster to terminate.
     */
    async terminateSubcluster(subclusterId: string): Promise<void> {
      await terminateSubcluster(subclusterId);
    },

    /**
     * Reload a subcluster by terminating and relaunching all its vats.
     *
     * @param subclusterId - ID of the subcluster to reload.
     * @returns The reloaded subcluster information.
     */
    async reloadSubcluster(subclusterId: string): Promise<Subcluster> {
      return reloadSubcluster(subclusterId);
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

    /**
     * Convert a kref string to a slot value (presence).
     *
     * Use this to restore a presence from a stored kref string after restart.
     *
     * @param kref - The kref string to convert.
     * @returns The slot value that will become a presence when marshalled.
     */
    getVatRoot(kref: string): SlotValue {
      return kslot(kref, 'vatRoot');
    },
  });

  return kernelFacet;
}
