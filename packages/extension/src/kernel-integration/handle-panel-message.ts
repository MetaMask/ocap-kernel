import type { Kernel, KVStore } from '@ocap/kernel';
import { makeLogger } from '@ocap/utils';

import { KernelCommandRegistry } from './command-registry.js';
import { clearStateHandler } from './handlers/clear-state.js';
import { executeDBQueryHandler } from './handlers/execute-db-query.js';
import { getStatusHandler } from './handlers/get-status.js';
import { launchVatHandler } from './handlers/launch-vat.js';
import { restartVatHandler } from './handlers/restart-vat.js';
import { sendMessageHandler } from './handlers/send-message.js';
import { terminateAllVatsHandler } from './handlers/terminate-all-vats.js';
import { terminateVatHandler } from './handlers/terminate-vat.js';
import { KernelControlMethod } from './messages.js';
import type { KernelControlCommand, KernelControlReply } from './messages.js';
import { loggingMiddleware } from './middlewares/logging.js';

const logger = makeLogger('[kernel-panel]');
const registry = new KernelCommandRegistry();

// Register middlewares
registry.use(loggingMiddleware);

// Register handlers
registry.register(KernelControlMethod.getStatus, getStatusHandler);
registry.register(KernelControlMethod.clearState, clearStateHandler);
registry.register(KernelControlMethod.sendMessage, sendMessageHandler);
registry.register(KernelControlMethod.executeDBQuery, executeDBQueryHandler);
registry.register(KernelControlMethod.launchVat, launchVatHandler);
registry.register(KernelControlMethod.restartVat, restartVatHandler);
registry.register(KernelControlMethod.terminateVat, terminateVatHandler);
registry.register(
  KernelControlMethod.terminateAllVats,
  terminateAllVatsHandler,
);

/**
 * Handles a message from the panel.
 *
 * @param kernel - The kernel instance.
 * @param kvStore - The KV store instance.
 * @param message - The message to handle.
 * @returns The reply to the message.
 */
export async function handlePanelMessage(
  kernel: Kernel,
  kvStore: KVStore,
  message: KernelControlCommand,
): Promise<KernelControlReply> {
  const { method, params } = message.payload;

  try {
    const result = await registry.execute(kernel, kvStore, method, params);

    return {
      id: message.id,
      payload: {
        method,
        params: result,
      },
    } as KernelControlReply;
  } catch (error) {
    logger.error('Error handling message:', error);
    return {
      id: message.id,
      payload: {
        method,
        params: {
          error: error instanceof Error ? error.message : String(error),
        },
      },
    } as KernelControlReply;
  }
}
