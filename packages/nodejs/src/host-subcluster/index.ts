import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { Logger } from '@metamask/logger';
import type {
  SystemVatBuildRootObject,
  KernelFacet,
  KernelSystemSubclusterConfig,
  SystemVatTransport,
  SystemVatSyscallHandler,
  SystemVatDeliverFn,
} from '@metamask/ocap-kernel';
import {
  SystemVatSupervisor,
  makeSyscallHandlerHolder,
} from '@metamask/ocap-kernel/vats';

/**
 * Result of creating a host subcluster.
 */
export type HostSubclusterResult = {
  /**
   * Configuration to pass to Kernel.make() systemSubclusters option.
   */
  config: KernelSystemSubclusterConfig;

  /**
   * Start the supervisor. Call after Kernel.make() returns.
   *
   * @returns A promise that resolves when the supervisor is started.
   */
  start: () => Promise<void>;

  /**
   * Get the kernel facet (available after bootstrap is called by kernel).
   *
   * @returns The kernel facet presence for making E() calls.
   */
  getKernelFacet: () => KernelFacet;
};

/**
 * Create a host subcluster for use with Kernel.make().
 *
 * This creates the supervisor and transport configuration needed to connect
 * a host subcluster to the kernel. The supervisor is created in this process,
 * and the transport allows the kernel to communicate with it.
 *
 * Usage:
 * ```typescript
 * const hostSubcluster = makeHostSubcluster({ logger });
 * const kernel = await Kernel.make(platformServices, db, {
 *   systemSubclusters: { subclusters: [hostSubcluster.config] },
 * });
 * await hostSubcluster.start();
 * const kernelFacet = hostSubcluster.getKernelFacet();
 * const result = await E(kernelFacet).launchSubcluster(config);
 * ```
 *
 * @param options - Options for creating the host subcluster.
 * @param options.logger - Optional logger for the supervisor.
 * @returns The host subcluster result with config and initialization functions.
 */
export function makeHostSubcluster(
  options: {
    logger?: Logger;
  } = {},
): HostSubclusterResult {
  const logger = options.logger ?? new Logger('host-subcluster');
  const vatName = 'kernelHost';

  // Captured kernel facet from bootstrap message
  let capturedKernelFacet: KernelFacet | null = null;

  // Create syscall handler holder for deferred wiring
  const syscallHandlerHolder = makeSyscallHandlerHolder();

  // Build root object that receives kernelFacet via bootstrap message
  const buildRootObject: SystemVatBuildRootObject = () => {
    return makeDefaultExo('KernelHostRoot', {
      // Bootstrap is called by the kernel with roots and services.
      // kernelFacet is always included in services.
      bootstrap: (
        _roots: Record<string, unknown>,
        services: { kernelFacet: KernelFacet },
      ) => {
        capturedKernelFacet = services.kernelFacet;
      },
    });
  };

  // Create the supervisor
  let supervisor: SystemVatSupervisor | null = null;

  // Create the transport
  const deliver: SystemVatDeliverFn = async (delivery) => {
    if (!supervisor) {
      throw new Error('Supervisor not initialized');
    }
    return supervisor.deliver(delivery);
  };

  const transport: SystemVatTransport = {
    deliver,
    setSyscallHandler: (handler: SystemVatSyscallHandler) => {
      syscallHandlerHolder.handler = handler;
    },
  };

  // Config for Kernel.make()
  const config: KernelSystemSubclusterConfig = {
    bootstrap: vatName,
    vatTransports: [
      {
        name: vatName,
        transport,
      },
    ],
  };

  return harden({
    config,

    start: async () => {
      // Create the supervisor
      supervisor = new SystemVatSupervisor({
        // The kernel assigns the actual ID via the transport
        // This placeholder is only used for logging
        id: 'sv0' as `sv${number}`,
        buildRootObject,
        vatPowers: {},
        parameters: undefined,
        syscallHandlerHolder,
        logger: logger.subLogger({ tags: ['supervisor'] }),
      });

      // Start the supervisor (dispatches startVat) - throws on failure
      await supervisor.start();
    },

    getKernelFacet: () => {
      if (!capturedKernelFacet) {
        throw new Error(
          'Kernel facet not available. Ensure start() was called and kernel has bootstrapped.',
        );
      }
      return capturedKernelFacet;
    },
  });
}
harden(makeHostSubcluster);
