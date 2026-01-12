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

      // A subcluster always has a bootstrap vat with a root object
      if (!capData) {
        throw new Error('launchSubcluster: expected capData with root kref');
      }

      // Parse the CapData body (format: "#..." where # prefix indicates JSON)
      const bodyJson = capData.body.startsWith('#')
        ? capData.body.slice(1)
        : capData.body;
      const body = JSON.parse(bodyJson) as { subclusterId?: string };
      if (!body.subclusterId) {
        throw new Error('launchSubcluster: expected subclusterId in body');
      }

      // Extract root kref from slots (first slot is bootstrap vat's root object)
      const rootKref = capData.slots[0];
      if (!rootKref) {
        throw new Error('launchSubcluster: expected root kref in slots');
      }

      return {
        subclusterId: body.subclusterId,
        rootKref,
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
      // Return wrapped kref for future CapTP marshalling to presence
      // TODO: Enable custom CapTP marshalling tables to convert this to a presence
      return { kref: krefString };
    },
  });
}
harden(makeKernelFacade);
