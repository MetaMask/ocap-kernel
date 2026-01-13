import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Kernel, ClusterConfig, KRef, VatId } from '@metamask/ocap-kernel';
import { kslot } from '@metamask/ocap-kernel';

import type { KernelFacade, LaunchResult } from '../../types.ts';

export type { KernelFacade } from '../../types.ts';

/**
 * Recursively convert kref strings in a value to kernel standins.
 *
 * When the background sends kref strings as arguments, we need to convert
 * them to standin objects that kernel-marshal can serialize properly.
 *
 * @param value - The value to convert.
 * @returns The value with kref strings converted to standins.
 */
function convertKrefsToStandins(value: unknown): unknown {
  // Check if it's a kref string (ko* or kp*)
  if (typeof value === 'string' && /^k[op]\d+$/u.test(value)) {
    return kslot(value);
  }
  // Recursively process arrays
  if (Array.isArray(value)) {
    return value.map(convertKrefsToStandins);
  }
  // Recursively process plain objects
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = convertKrefsToStandins(val);
    }
    return result;
  }
  // Return primitives as-is
  return value;
}

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
