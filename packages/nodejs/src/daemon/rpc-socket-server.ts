import { RpcService } from '@metamask/kernel-rpc-methods';
import type { KernelDatabase } from '@metamask/kernel-store';
import type { Kernel } from '@metamask/ocap-kernel';
import { rpcHandlers } from '@metamask/ocap-kernel/rpc';
import { unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';

/**
 * Handle returned by {@link startRpcSocketServer}.
 */
export type RpcSocketServerHandle = {
  close: () => Promise<void>;
};

/**
 * Start a Unix socket server that processes JSON-RPC requests through RpcService.
 *
 * Each connection reads one newline-delimited JSON-RPC request, processes it
 * via the kernel's RPC handlers, writes a JSON-RPC response, and closes.
 *
 * The special `shutdown` method is intercepted before RPC dispatch and triggers
 * the provided {@link onShutdown} callback (if any) after responding to the client.
 *
 * @param options - Server options.
 * @param options.socketPath - The Unix socket path to listen on.
 * @param options.kernel - The kernel instance.
 * @param options.kernelDatabase - The kernel database instance.
 * @param options.onShutdown - Optional callback invoked when a `shutdown` RPC is received.
 * @returns A handle with a `close()` function for cleanup.
 */
export async function startRpcSocketServer({
  socketPath,
  kernel,
  kernelDatabase,
  onShutdown,
}: {
  socketPath: string;
  kernel: Kernel;
  kernelDatabase: KernelDatabase;
  onShutdown?: (() => Promise<void>) | undefined;
}): Promise<RpcSocketServerHandle> {
  const rpcService = new RpcService(rpcHandlers, {
    kernel,
    executeDBQuery: (sql: string) => kernelDatabase.executeQuery(sql),
  });

  const server = createServer((socket) => {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx === -1) {
        return;
      }

      const line = buffer.slice(0, idx);
      buffer = '';

      handleRequest(rpcService, line, onShutdown)
        .then((response) => {
          socket.end(`${JSON.stringify(response)}\n`);
          return undefined;
        })
        .catch(() => {
          socket.end(
            `${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } })}\n`,
          );
        });
    });

    socket.on('error', () => {
      // Ignore client socket errors (e.g. broken pipe from probe connections)
    });
  });

  await listen(server, socketPath);

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

/**
 * Handle a single JSON-RPC request line, intercepting the `shutdown` method.
 *
 * If the method is `shutdown` and an `onShutdown` callback is provided, the
 * callback is scheduled (without awaiting) after a successful response is
 * returned. All other methods are delegated to {@link processRequest}.
 *
 * @param rpcService - The RPC service to execute methods against.
 * @param line - The raw JSON line from the socket.
 * @param onShutdown - Optional shutdown callback.
 * @returns A JSON-RPC response object.
 */
async function handleRequest(
  rpcService: RpcService<typeof rpcHandlers>,
  line: string,
  onShutdown?: () => Promise<void>,
): Promise<Record<string, unknown>> {
  try {
    const request = JSON.parse(line) as {
      id?: unknown;
      method?: string;
    };

    if (request.method === 'shutdown') {
      const id = request.id ?? null;
      // Schedule shutdown after responding to the client.
      if (onShutdown) {
        setTimeout(() => {
          onShutdown().catch(() => {
            // Best-effort shutdown — errors are logged by the caller.
          });
        }, 0);
      }
      return { jsonrpc: '2.0', id, result: { status: 'shutting down' } };
    }
  } catch {
    // Fall through to processRequest which handles parse errors.
  }

  return processRequest(rpcService, line);
}

/**
 * Process a single JSON-RPC request line and return a JSON-RPC response.
 *
 * @param rpcService - The RPC service to execute methods against.
 * @param line - The raw JSON line from the socket.
 * @returns A JSON-RPC response object.
 */
async function processRequest(
  rpcService: RpcService<typeof rpcHandlers>,
  line: string,
): Promise<Record<string, unknown>> {
  let id: unknown = null;

  try {
    const request = JSON.parse(line) as {
      jsonrpc?: string;
      id?: unknown;
      method?: string;
      params?: unknown;
    };
    id = request.id ?? null;

    const { method } = request;
    // Default to empty array when no params provided (handlers expect validated params)
    const params = request.params ?? [];

    if (typeof method !== 'string') {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid request: missing method' },
      };
    }

    rpcService.assertHasMethod(method);
    const result = await rpcService.execute(method, params);

    return { jsonrpc: '2.0', id, result: result ?? null };
  } catch (error) {
    const code = isRpcError(error) ? error.code : -32603;
    const message = error instanceof Error ? error.message : 'Internal error';

    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}

/**
 * Check if an error is an RPC error with a numeric code.
 *
 * @param error - The error to check.
 * @returns True if the error has a numeric code property.
 */
function isRpcError(error: unknown): error is { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  );
}

/**
 * Start listening on a Unix socket path.
 *
 * @param server - The net.Server instance.
 * @param socketPath - The Unix socket path.
 */
async function listen(server: Server, socketPath: string): Promise<void> {
  // Remove stale socket file from a previous run, if any.
  try {
    await unlink(socketPath);
  } catch {
    // Ignore — file may not exist.
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}
