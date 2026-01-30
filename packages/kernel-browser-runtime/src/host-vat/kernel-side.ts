import type { PromiseKit } from '@endo/promise-kit';
import { makePromiseKit } from '@endo/promise-kit';
import type { Logger } from '@metamask/logger';
import type {
  DeliveryObject,
  SystemVatConfig,
  SystemVatSyscallHandler,
  SystemVatTransport,
} from '@metamask/ocap-kernel';
import type { DuplexStream } from '@metamask/streams';

import type {
  KernelToSupervisorMessage,
  SupervisorToKernelMessage,
} from './transport.ts';

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
   * @param stream - The duplex stream to communicate with the supervisor.
   */
  connect: (
    stream: DuplexStream<SupervisorToKernelMessage, KernelToSupervisorMessage>,
  ) => void;
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

  // Pending deliveries waiting for results
  const pendingDeliveries = new Map<string, PromiseKit<string | null>>();
  let deliveryCounter = 0;

  // Stream for communication - set when connect() is called
  let stream: DuplexStream<
    SupervisorToKernelMessage,
    KernelToSupervisorMessage
  > | null = null;

  /**
   * Deliver a message to the supervisor over the stream.
   *
   * @param delivery - The delivery object to send.
   * @returns A promise that resolves to the delivery error (null if success).
   */
  const deliver = async (delivery: DeliveryObject): Promise<string | null> => {
    if (!stream) {
      throw new Error('Stream not connected');
    }

    const id = String(deliveryCounter);
    deliveryCounter += 1;

    const resultKit = makePromiseKit<string | null>();
    pendingDeliveries.set(id, resultKit);

    await stream.write({ type: 'delivery', delivery, id });

    return resultKit.promise;
  };

  /**
   * Handle incoming messages from the supervisor.
   *
   * @param message - The message from the supervisor.
   */
  const handleMessage = (message: SupervisorToKernelMessage): void => {
    switch (message.type) {
      case 'ready':
        supervisorReady.resolve();
        break;

      case 'syscall':
        if (!syscallHandler) {
          logger?.warn('Received syscall before handler was set');
          return;
        }
        // Process syscall synchronously - the result is ignored because
        // the supervisor uses optimistic execution
        try {
          syscallHandler(message.syscall);
        } catch (error) {
          // Syscall errors are handled by the kernel (vat termination)
          logger?.error('Syscall error:', error);
        }
        break;

      case 'delivery-result': {
        const pending = pendingDeliveries.get(message.id);
        if (pending) {
          pendingDeliveries.delete(message.id);
          pending.resolve(message.error);
        } else {
          logger?.warn(`Received result for unknown delivery: ${message.id}`);
        }
        break;
      }

      default:
        logger?.warn(
          `Unknown message type: ${(message as { type: string }).type}`,
        );
    }
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
    connectedStream: DuplexStream<
      SupervisorToKernelMessage,
      KernelToSupervisorMessage
    >,
  ): void => {
    stream = connectedStream;

    // Start draining the stream for incoming messages
    stream.drain(handleMessage).catch((error) => {
      logger?.error('Stream error:', error);
      // Reject any pending deliveries
      for (const pending of pendingDeliveries.values()) {
        pending.reject(error as Error);
      }
      pendingDeliveries.clear();
    });

    // Send connected message to supervisor
    stream.write({ type: 'connected' }).catch((error) => {
      logger?.error('Failed to send connected message:', error);
    });
  };

  return harden({
    config,
    connect,
  });
}
harden(makeKernelHostVat);
