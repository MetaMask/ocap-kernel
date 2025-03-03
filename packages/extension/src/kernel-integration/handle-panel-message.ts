import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';
import { makeLogger } from '@ocap/utils';

import { KernelCommandRegistry } from './command-registry.ts';
import type { CommandHandler } from './command-registry.ts';
import { handlers } from './handlers/index.ts';
import type { KernelControlCommand, KernelControlReply } from './messages.ts';
import { loggingMiddleware } from './middlewares/logging.ts';

const logger = makeLogger('[kernel-panel]');
const registry = new KernelCommandRegistry();

// Register middlewares
registry.use(loggingMiddleware);

// Register handlers
handlers.forEach((handler) =>
  registry.register(handler as CommandHandler<typeof handler.method>),
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
