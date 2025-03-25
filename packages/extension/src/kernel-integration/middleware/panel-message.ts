import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';

import { KernelCommandRegistry } from '../command-registry.ts';
import type { CommandHandler } from '../command-registry.ts';
import { handlers } from '../handlers/index.ts';
import type { KernelControlCommand } from '../messages.ts';

const registry = new KernelCommandRegistry();

// Register handlers
handlers.forEach((handler) =>
  registry.register(handler as CommandHandler<typeof handler.method>),
);

type KernelControlParams = KernelControlCommand['params'];

/**
 * Creates a middleware function that handles panel messages.
 *
 * @param kernel - The kernel instance.
 * @param kernelDatabase - The kernel database instance.
 * @returns The middleware function.
 */
export const createPanelMessageMiddleware = (
  kernel: Kernel,
  kernelDatabase: KernelDatabase,
): JsonRpcMiddleware<KernelControlParams, Json> =>
  createAsyncMiddleware(async (req, res, _next) => {
    const { method, params } = req;
    // @ts-expect-error - TODO:rekm execute() should probably just expect a string "method"
    res.result = await registry.execute(kernel, kernelDatabase, method, params);
  });
