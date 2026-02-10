import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { RpcService } from '@metamask/kernel-rpc-methods';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';
import { rpcHandlers } from '@metamask/ocap-kernel/rpc';
import { isJsonRpcRequest } from '@metamask/utils';

/**
 * Makes a middleware function that handles panel messages.
 *
 * @param kernel - The kernel instance.
 * @param kernelDatabase - The kernel database instance.
 * @returns The middleware function.
 */
export const makePanelMessageMiddleware = (
  kernel: Kernel,
  kernelDatabase: KernelDatabase,
): JsonRpcMiddleware => {
  const rpcService: RpcService<typeof rpcHandlers> = new RpcService(
    rpcHandlers,
    {
      kernel,
      executeDBQuery: (sql: string) => kernelDatabase.executeQuery(sql),
    },
  );

  return async ({ request }) => {
    const { method, params } = request;
    rpcService.assertHasMethod(method);
    const result = await rpcService.execute(method, params);
    return isJsonRpcRequest(request) ? result : undefined;
  };
};
