import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Kernel, ClusterConfig, KRef, VatId } from '@metamask/ocap-kernel';

import { convertKrefsToStandins } from '../../kref-presence.ts';
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
      const { subclusterId, bootstrapRootKref } =
        await kernel.launchSubcluster(config);
      return { subclusterId, rootKref: bootstrapRootKref };
    },

    terminateSubcluster: async (subclusterId: string) => {
      return kernel.terminateSubcluster(subclusterId);
    },

    queueMessage: async (target: KRef, method: string, args: unknown[]) => {
      // Convert kref strings in args to standins for kernel-marshal
      const processedArgs = convertKrefsToStandins(args) as unknown[];
      return kernel.queueMessage(target, method, processedArgs);
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
