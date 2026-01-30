import type {
  VatDeliveryObject,
  VatSyscallObject,
  VatSyscallResult,
} from '@agoric/swingset-liveslots';
import { makePromiseKit } from '@endo/promise-kit';
import type { Logger } from '@metamask/logger';
import type {
  KernelFacet,
  SystemVatBuildRootObject,
} from '@metamask/ocap-kernel';
import { SystemVatSupervisor } from '@metamask/ocap-kernel/vats';
import type { DuplexStream } from '@metamask/streams';

import type {
  KernelToSupervisorMessage,
  SupervisorToKernelMessage,
} from './transport.ts';

/**
 * Result of creating a background-side host vat.
 */
export type BackgroundHostVatResult = {
  /**
   * Connect and start the supervisor.
   * Call this with the stream to the kernel Worker.
   *
   * @param stream - The duplex stream to communicate with the kernel.
   */
  connect: (
    stream: DuplexStream<KernelToSupervisorMessage, SupervisorToKernelMessage>,
  ) => void;

  /**
   * Promise that resolves to kernelFacet when bootstrap completes.
   * No polling needed - just await this promise after calling connect().
   */
  kernelFacetPromise: Promise<KernelFacet>;
};

/**
 * Create a background-side host vat for use in the browser background script.
 *
 * This creates a supervisor that communicates with the kernel over a stream.
 * The supervisor uses an optimistic syscall model where syscalls are fire-and-forget,
 * returning ['ok', null] immediately.
 *
 * Usage in background script:
 * ```typescript
 * const hostVat = makeBackgroundHostVat({
 *   buildRootObject: (vatPowers) => {
 *     const kernelFacet = vatPowers.kernelFacet as KernelFacet;
 *     return makeDefaultExo('BackgroundRoot', {
 *       // ... methods that use E(kernelFacet)
 *     });
 *   },
 *   logger,
 * });
 * const stream = await connectToKernelHostVat();
 * hostVat.connect(stream);
 * const kernelFacet = await hostVat.kernelFacetPromise;
 * const result = await E(kernelFacet).launchSubcluster(config);
 * ```
 *
 * @param options - Options for creating the host vat.
 * @param options.buildRootObject - Function to build the vat's root object.
 * @param options.logger - Optional logger for debugging.
 * @returns The host vat result with connect and kernelFacetPromise.
 */
export function makeBackgroundHostVat(options: {
  buildRootObject: SystemVatBuildRootObject;
  logger?: Logger;
}): BackgroundHostVatResult {
  const { buildRootObject, logger } = options;

  // Promise kit for kernel facet - resolves when bootstrap is called
  const kernelFacetKit = makePromiseKit<KernelFacet>();

  // Stream for communication - set when connect() is called
  let stream: DuplexStream<
    KernelToSupervisorMessage,
    SupervisorToKernelMessage
  > | null = null;

  // Supervisor instance - created when connect() is called
  let supervisor: SystemVatSupervisor | null = null;

  /**
   * Execute a syscall by sending it to the kernel.
   * Uses optimistic execution - returns success immediately.
   *
   * @param vso - The syscall object to execute.
   * @returns A syscall success result.
   */
  const executeSyscall = (vso: VatSyscallObject): VatSyscallResult => {
    if (!stream) {
      throw new Error('Stream not connected');
    }

    // Send syscall notification (fire-and-forget)
    // The syscall is sent as-is; structured clone handles serialization
    stream.write({ type: 'syscall', syscall: vso }).catch((error) => {
      logger?.error('Failed to send syscall:', error);
    });

    // Return success immediately (optimistic execution)
    return ['ok', null];
  };

  /**
   * Wrap buildRootObject to capture the kernelFacet from bootstrap.
   *
   * @param vatPowers - The vat powers provided by liveslots.
   * @param parameters - Optional parameters for the vat.
   * @returns The root object for this vat.
   */
  const wrappedBuildRootObject: SystemVatBuildRootObject = (
    vatPowers,
    parameters,
  ) => {
    // Capture kernelFacet from vatPowers before passing to user's buildRootObject
    if (vatPowers.kernelFacet) {
      kernelFacetKit.resolve(vatPowers.kernelFacet as KernelFacet);
    }
    return buildRootObject(vatPowers, parameters);
  };

  /**
   * Handle incoming messages from the kernel.
   *
   * @param message - The message from the kernel.
   */
  const handleMessage = async (
    message: KernelToSupervisorMessage,
  ): Promise<void> => {
    switch (message.type) {
      case 'connected':
        // Kernel acknowledges connection - nothing to do
        logger?.debug('Received connected message from kernel');
        break;

      case 'delivery': {
        if (!supervisor) {
          logger?.error('Received delivery before supervisor was created');
          await stream?.write({
            type: 'delivery-result',
            id: message.id,
            error: 'Supervisor not ready',
          });
          return;
        }

        // Deliver to supervisor and send result back
        // Cast from DeliveryObject (our JSON-safe type) to VatDeliveryObject
        const deliveryError = await supervisor.deliver(
          message.delivery as unknown as VatDeliveryObject,
        );

        await stream?.write({
          type: 'delivery-result',
          id: message.id,
          error: deliveryError,
        });
        break;
      }

      default:
        logger?.warn(
          `Unknown message type: ${(message as { type: string }).type}`,
        );
    }
  };

  const connect = (
    connectedStream: DuplexStream<
      KernelToSupervisorMessage,
      SupervisorToKernelMessage
    >,
  ): void => {
    stream = connectedStream;

    // Create and start the supervisor
    const supervisorOptions = {
      buildRootObject: wrappedBuildRootObject,
      executeSyscall,
      ...(logger && { logger: logger.subLogger({ tags: ['supervisor'] }) }),
    };
    SystemVatSupervisor.make(supervisorOptions)
      .then(async (createdSupervisor) => {
        supervisor = createdSupervisor;

        // Signal to kernel that we're ready
        return stream?.write({ type: 'ready' });
      })
      .then(async () => {
        // Start draining the stream for incoming messages
        return stream?.drain(handleMessage);
      })
      .catch((error) => {
        logger?.error('Supervisor initialization error:', error);
        kernelFacetKit.reject(error as Error);
      });
  };

  return harden({
    connect,
    kernelFacetPromise: kernelFacetKit.promise,
  });
}
harden(makeBackgroundHostVat);
