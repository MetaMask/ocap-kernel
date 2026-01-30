import type {
  VatDeliveryObject,
  VatSyscallObject,
  VatSyscallResult,
} from '@agoric/swingset-liveslots';
import { makePromiseKit } from '@endo/promise-kit';
import { RpcClient, RpcService } from '@metamask/kernel-rpc-methods';
import { stringify } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import type {
  KernelFacet,
  SystemVatBuildRootObject,
} from '@metamask/ocap-kernel';
import { SystemVatSupervisor } from '@metamask/ocap-kernel/vats';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcRequest } from '@metamask/utils';

import { supervisorToKernelSpecs, supervisorHandlers } from './rpc/index.ts';

/**
 * Result of creating a background-side host vat.
 */
export type BackgroundHostVatResult = {
  /**
   * Connect and start the supervisor.
   * Call this with the stream to the kernel Worker.
   *
   * @param stream - The duplex stream for JSON-RPC communication with the kernel.
   */
  connect: (stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>) => void;

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

  // RpcClient for sending syscalls to kernel - set when connect() is called
  let rpcClient: RpcClient<typeof supervisorToKernelSpecs> | null = null;

  /**
   * Execute a syscall by sending it to the kernel via RPC notification.
   * Uses optimistic execution - returns success immediately.
   *
   * @param vso - The syscall object to execute.
   * @returns A syscall success result.
   */
  const executeSyscall = (vso: VatSyscallObject): VatSyscallResult => {
    if (!rpcClient) {
      throw new Error('Stream not connected');
    }

    // Send syscall as notification (fire-and-forget)
    // Cast needed because the RPC spec uses slightly different types
    rpcClient.notify('syscall', vso as never).catch((error) => {
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

  const connect = (
    stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>,
  ): void => {
    rpcClient = new RpcClient(
      supervisorToKernelSpecs,
      async (message) => {
        await stream.write(message);
      },
      'supervisor:',
      logger,
    );

    // Create and start the supervisor
    const supervisorOptions = {
      buildRootObject: wrappedBuildRootObject,
      executeSyscall,
      ...(logger && { logger: logger.subLogger({ tags: ['supervisor'] }) }),
    };

    SystemVatSupervisor.make(supervisorOptions)
      .then(async (createdSupervisor) => {
        // Create RpcService for handling delivery requests from kernel
        const rpcService = new RpcService(supervisorHandlers, {
          handleDelivery: async (params) => {
            const deliveryError = await createdSupervisor.deliver(
              params as VatDeliveryObject,
            );
            // SystemVatSupervisor returns just the error, but the spec expects
            // VatDeliveryResult which is [VatCheckpoint, error]. System vats
            // don't checkpoint, so we return an empty checkpoint.
            const emptyCheckpoint: [[string, string][], string[]] = [[], []];
            return [emptyCheckpoint, deliveryError];
          },
        });

        // Signal to kernel that we're ready via notification
        await stream.write({
          jsonrpc: '2.0' as const,
          method: 'ready',
        });

        // Start draining the stream for incoming messages
        return stream.drain(async (message) => {
          if (isJsonRpcRequest(message) && message.method === 'deliver') {
            // Request from kernel (deliver)
            try {
              const result = await rpcService.execute(
                'deliver',
                message.params,
              );
              await stream.write({
                jsonrpc: '2.0',
                id: message.id,
                result,
              });
            } catch (error) {
              await stream.write({
                jsonrpc: '2.0',
                id: message.id,
                error: {
                  code: -32603,
                  message: (error as Error).message,
                },
              });
            }
          } else {
            throw new Error(
              `Unexpected host vat message from kernel: ${stringify(message)}`,
            );
          }
        });
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
