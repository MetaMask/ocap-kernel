import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Kernel, ClusterConfig, KRef, VatId } from '@metamask/ocap-kernel';

import type { KernelFacade, LaunchResult } from '../../types.ts';

export type { KernelFacade } from '../../types.ts';

/**
 * Create the kernel facade exo that exposes kernel methods via CapTP.
 *
 * @param kernel - The kernel instance to wrap.
 * @returns The kernel facade exo.
 */
export function makeKernelFacade(kernel: Kernel): KernelFacade {
  return makeDefaultExo('KernelFacade', {
    ping: async () => 'pong' as const,

    launchSubcluster: async (config: ClusterConfig): Promise<LaunchResult> => {
      const capData = await kernel.launchSubcluster(config);

      // If no capData returned (no bootstrap vat), return minimal result
      if (!capData) {
        return { subclusterId: '' };
      }

      // Parse the CapData body (format: "#..." where # prefix indicates JSON)
      const bodyJson = capData.body.startsWith('#')
        ? capData.body.slice(1)
        : capData.body;
      const body = JSON.parse(bodyJson) as { subclusterId?: string };

      // Extract root kref from slots (first slot is bootstrap vat's root object)
      const rootKref = capData.slots[0];

      return {
        subclusterId: body.subclusterId ?? '',
        rootKref: rootKref ? { kref: rootKref } : undefined, // Becomes presence via CapTP
        rootKrefString: rootKref, // Plain string for storage
      };
    },

    terminateSubcluster: async (subclusterId: string) => {
      return kernel.terminateSubcluster(subclusterId);
    },

    queueMessage: async (target: KRef, method: string, args: unknown[]) => {
      return kernel.queueMessage(target, method, args);
    },

    getStatus: async () => {
      return kernel.getStatus();
    },

    pingVat: async (vatId: VatId) => {
      return kernel.pingVat(vatId);
    },

    getVatRoot: async (krefString: string) => {
      // Convert a kref string to a presence by wrapping it
      // CapTP's custom marshalling will convert this to a presence on the background side
      return { kref: krefString };
    },
  });
}
harden(makeKernelFacade);
