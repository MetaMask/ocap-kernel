import type { VatSyscallObject } from '@agoric/swingset-liveslots';
import { makePromiseKit } from '@endo/promise-kit';
import { RpcClient, RpcService } from '@metamask/kernel-rpc-methods';
import { stringify } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import type {
  DeliveryObject,
  SystemVatConfig,
  SystemVatSyscallHandler,
  SystemVatTransport,
} from '@metamask/ocap-kernel';
import type { DuplexStream } from '@metamask/streams';
import { isJsonRpcNotification, isJsonRpcResponse } from '@metamask/utils';

import { kernelToSupervisorSpecs, kernelHandlers } from './rpc/index.ts';

/**
 * Result of creating a kernel-side host vat.
 */
export type KernelHostVatResult = {
  /**
   * Configuration to pass to Kernel.make() hostVat option.
   */
  config: SystemVatConfig;

  /**
   * Connect the stream after kernel is created.
   * Call this to wire up communication with the supervisor.
   *
   * @param stream - The duplex stream for JSON-RPC communication with the supervisor.
   */
  connect: (stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>) => void;
};

/**
 * Create a kernel-side host vat for use with Kernel.make().
 *
 * This creates the transport configuration needed for the kernel to communicate
 * with a system vat supervisor running in a different process (e.g., browser
 * background script).
 *
 * The transport uses an optimistic syscall model where syscalls are fire-and-forget,
 * returning ['ok', null] immediately. The kernel handles failures by terminating
 * the vat and rolling back the crank.
 *
 * Usage in kernel Worker:
 * ```typescript
 * const hostVat = makeKernelHostVat({ logger });
 * const kernel = await Kernel.make(platformServices, db, {
 *   hostVat: hostVat.config,
 * });
 * const stream = await createHostVatStream(); // e.g., BroadcastChannel
 * hostVat.connect(stream);
 * ```
 *
 * @param options - Options for creating the host vat.
 * @param options.name - Optional name for the host vat (default: 'kernelHost').
 * @param options.logger - Optional logger for debugging.
 * @returns The host vat result with config and connect function.
 */
export function makeKernelHostVat(options?: {
  name?: string;
  logger?: Logger;
}): KernelHostVatResult {
  const vatName = options?.name ?? 'kernelHost';
  const logger = options?.logger;

  // Syscall handler - set by kernel during registerSystemVat()
  let syscallHandler: SystemVatSyscallHandler | null = null;

  // Promise kit to signal when supervisor is ready
  const supervisorReady = makePromiseKit<void>();

  // RpcClient for sending deliveries to supervisor - set when connect() is called
  let rpcClient: RpcClient<typeof kernelToSupervisorSpecs> | null = null;

  // RpcService for receiving syscalls from supervisor
  const rpcService = new RpcService(kernelHandlers, {
    handleSyscall: (params) => {
      if (!syscallHandler) {
        logger?.warn('Received syscall before handler was set');
        return;
      }
      // Process syscall synchronously - the result is ignored because
      // the supervisor uses optimistic execution
      try {
        // Cast needed because the RPC spec uses slightly different types
        syscallHandler(params as unknown as VatSyscallObject);
      } catch (error) {
        // Syscall errors are handled by the kernel (vat termination)
        logger?.error('Syscall error:', error);
      }
    },
  });

  /**
   * Deliver a message to the supervisor via RPC.
   *
   * @param delivery - The delivery object to send.
   * @returns A promise that resolves to the delivery error (null if success).
   */
  const deliver = async (delivery: DeliveryObject): Promise<string | null> => {
    if (!rpcClient) {
      throw new Error('Stream not connected');
    }

    // The deliver spec returns [checkpoint, deliveryError], we want just the error
    const result = await rpcClient.call('deliver', delivery);
    return result[1];
  };

  const transport: SystemVatTransport = {
    deliver,
    setSyscallHandler: (handler: SystemVatSyscallHandler) => {
      syscallHandler = handler;
    },
    awaitConnection: async () => supervisorReady.promise,
  };

  const config: SystemVatConfig = {
    name: vatName,
    transport,
  };

  const connect = (
    stream: DuplexStream<JsonRpcMessage, JsonRpcMessage>,
  ): void => {
    rpcClient = new RpcClient(
      kernelToSupervisorSpecs,
      async (message) => {
        await stream.write(message);
      },
      'kernel:',
      logger,
    );

    // Capture reference for use in drain callback
    const client = rpcClient;

    // Start draining the stream for incoming messages
    stream
      .drain(async (message) => {
        if (isJsonRpcResponse(message)) {
          // Response to our deliver request
          client.handleResponse(message.id as string, message);
        } else if (isJsonRpcNotification(message)) {
          if (message.method === 'ready') {
            // Supervisor signals it's ready
            supervisorReady.resolve();
          } else if (message.method === 'syscall') {
            // Syscall notification from supervisor
            await rpcService.execute('syscall', message.params);
          } else {
            throw new Error(
              `Unexpected host vat message from supervisor: ${stringify(message)}`,
            );
          }
        }
      })
      .catch((error) => {
        logger?.error('Stream error:', error);
        client.rejectAll(error as Error);
      });
  };

  return harden({
    config,
    connect,
  });
}
harden(makeKernelHostVat);
