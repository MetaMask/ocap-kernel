import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { ClusterConfig, Kernel } from '@metamask/ocap-kernel';
import type { Json, JsonRpcParams } from '@metamask/utils';
import { RpcService } from '@ocap/rpc-methods';

import { handlers } from '../handlers/index.ts';

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
): JsonRpcMiddleware<JsonRpcParams, Json> => {
  const rpcService: RpcService<typeof handlers> = new RpcService(handlers, {
    kernel,
    executeDBQuery: (sql: string) => kernelDatabase.executeQuery(sql),
    updateClusterConfig: (config: ClusterConfig) =>
      (kernel.clusterConfig = config),
  });

  return createAsyncMiddleware(async (req, res, _next) => {
    const { method, params } = req;
    rpcService.assertHasMethod(method);
    res.result = await rpcService.execute(method, params);
  });
};
