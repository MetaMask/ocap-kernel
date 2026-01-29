import { makePromiseKit } from '@endo/promise-kit';
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
import { SystemVatSupervisor } from '@metamask/ocap-kernel/vats';

/**
 * Result of creating a host subcluster.
 */
export type HostSubclusterResult = {
  /**
   * Configuration to pass to Kernel.make() systemSubclusters option.
   */
  config: KernelSystemSubclusterConfig;

  /**
   * Call after Kernel.make() returns to initiate connection from supervisor side.
   * This creates and starts the supervisor, then signals the kernel that
   * the connection is ready. The kernel will then send the bootstrap message.
   */
  connect: () => void;

  /**
   * Promise that resolves to kernelFacet when bootstrap completes.
   * No polling needed - just await this promise after calling connect().
   */
  kernelFacetPromise: Promise<KernelFacet>;
};

/**
 * Create a host subcluster for use with Kernel.make().
 *
 * This creates the supervisor and transport configuration needed to connect
 * a host subcluster to the kernel. The supervisor is created when `connect()`
 * is called (after Kernel.make() returns).
 *
 * Usage:
 * ```typescript
 * const hostSubcluster = makeHostSubcluster({ logger });
 * const kernel = await Kernel.make(platformServices, db, {
 *   systemSubclusters: { subclusters: [hostSubcluster.config] },
 * });
 * hostSubcluster.connect();  // Supervisor pushes connection to kernel
 * const kernelFacet = await hostSubcluster.kernelFacetPromise;
 * const result = await E(kernelFacet).launchSubcluster(config);
 * ```
 *
 * @param options - Options for creating the host subcluster.
 * @param options.logger - Optional logger for the supervisor.
 * @returns The host subcluster result with config, connect, and kernelFacetPromise.
 */
export function makeHostSubcluster(
  options: {
    logger?: Logger;
  } = {},
): HostSubclusterResult {
  const logger = options.logger ?? new Logger('host-subcluster');
  const vatName = 'kernelHost';

  // Promise kit for kernel facet - resolves when bootstrap is called
  const kernelFacetKit = makePromiseKit<KernelFacet>();

  // Syscall handler - set by kernel during prepareSystemSubcluster()
  let syscallHandler: SystemVatSyscallHandler | null = null;

  // Build root object that captures kernelFacet from bootstrap
  const buildRootObject: SystemVatBuildRootObject = () => {
    return makeDefaultExo('KernelHostRoot', {
      // Bootstrap is called by the kernel with roots and services.
      // kernelFacet is always included in services.
      bootstrap: (
        _roots: Record<string, unknown>,
        services: { kernelFacet: KernelFacet },
      ) => {
        kernelFacetKit.resolve(services.kernelFacet);
      },
    });
  };

  // Promise kit to signal when supervisor is ready to receive deliveries
  const supervisorReady = makePromiseKit<SystemVatSupervisor>();

  // Promise kit for connection - resolved when connect() is called and supervisor is ready
  const connectionKit = makePromiseKit<void>();

  // Create the transport with a deliver function that waits for the supervisor
  const deliver: SystemVatDeliverFn = async (delivery) => {
    const supervisor = await supervisorReady.promise;
    return supervisor.deliver(delivery);
  };

  const transport: SystemVatTransport = {
    deliver,
    setSyscallHandler: (handler: SystemVatSyscallHandler) => {
      syscallHandler = handler;
    },
    // Kernel calls this to wait for connection from supervisor side
    awaitConnection: async () => connectionKit.promise,
  };

  /**
   * Called after Kernel.make() returns to initiate connection from supervisor side.
   * Creates and starts the supervisor, then resolves the connection promise.
   */
  const connect = (): void => {
    if (!syscallHandler) {
      throw new Error(
        'Cannot connect: syscall handler not set. Was Kernel.make() called with this config?',
      );
    }
    // Create and start the supervisor
    SystemVatSupervisor.make({
      buildRootObject,
      executeSyscall: syscallHandler,
      logger: logger.subLogger({ tags: ['supervisor'] }),
    })
      .then((supervisor) => {
        supervisorReady.resolve(supervisor);
        // Signal connection ready - kernel will now send bootstrap message
        connectionKit.resolve();
        return undefined;
      })
      .catch((error) => {
        connectionKit.reject(error as Error);
        kernelFacetKit.reject(error as Error);
      });
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
    connect,
    kernelFacetPromise: kernelFacetKit.promise,
  });
}
harden(makeHostSubcluster);
