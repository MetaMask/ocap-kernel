import { makeDefaultExo } from '@metamask/kernel-utils';

import type { Kernel } from './Kernel.ts';
import type { SlotValue } from './liveslots/kernel-marshal.ts';
import type { PingVatResult } from './rpc/index.ts';
import type { Subcluster, KernelStatus, KRef, VatId } from './types.ts';

/**
 * Dependencies required to create a kernel facet.
 */
export type KernelFacetDependencies = Pick<
  Kernel,
  | 'getPresence'
  | 'getStatus'
  | 'getSubcluster'
  | 'getSubclusters'
  | 'getSystemSubclusterRoot'
  | 'launchSubcluster'
  | 'pingVat'
  | 'queueMessage'
  | 'reloadSubcluster'
  | 'reset'
  | 'terminateSubcluster'
>;

/**
 * The kernel facet interface.
 *
 * This is the interface provided as a vatpower to the bootstrap vat of a
 * system vat. It enables privileged kernel operations.
 */
export type KernelFacet = KernelFacetDependencies & {
  /**
   * Ping the kernel.
   *
   * @returns The string 'pong'.
   */
  ping: () => 'pong';
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
    getPresence,
    getStatus,
    getSubcluster,
    getSubclusters,
    getSystemSubclusterRoot,
    launchSubcluster,
    pingVat,
    queueMessage,
    reloadSubcluster,
    reset,
    terminateSubcluster,
  } = deps;

  const kernelFacet = makeDefaultExo('kernelFacet', {
    /**
     * Ping the kernel.
     *
     * @returns The string 'pong'.
     */
    ping(): 'pong' {
      return 'pong';
    },

    /**
     * Ping a vat.
     *
     * @param vatId - The ID of the vat to ping.
     * @returns A promise that resolves to the ping result.
     */
    async pingVat(vatId: VatId): Promise<PingVatResult> {
      return pingVat(vatId);
    },

    /**
     * Get the bootstrap root kref of a system subcluster by name.
     *
     * @param name - The name of the system subcluster.
     * @returns The bootstrap root kref.
     * @throws If the system subcluster is not found.
     */
    getSystemSubclusterRoot(name: string): KRef {
      return getSystemSubclusterRoot(name);
    },

    /**
     * Reset the kernel state.
     *
     * @returns A promise that resolves when the reset is complete.
     */
    async reset(): Promise<void> {
      return reset();
    },

    /**
     * Launch a dynamic subcluster.
     *
     * @param args - Arguments to pass to launchSubcluster.
     * @returns A promise for the launch result.
     */
    launchSubcluster: async (...args: Parameters<typeof launchSubcluster>) =>
      launchSubcluster(...args),

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
     * @param kref - The kref string to convert.
     * @param iface - The interface name for the slot value.
     * @returns The slot value that will become a presence when marshalled.
     */
    getPresence(kref: string, iface: string = 'Kernel Object'): SlotValue {
      return getPresence(kref, iface);
    },

    /**
     * Send a message to a vat.
     *
     * @param target - The vat to send the message to.
     * @param method - The method name to call.
     * @param args - Arguments to pass to the method.
     * @returns The result from the subcluster.
     */
    queueMessage(target: KRef, method: string, args: unknown[]): unknown {
      return queueMessage(target, method, args);
    },
  });
  return kernelFacet as KernelFacet;
}
