import type { Logger } from '@metamask/logger';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';

import { SOCK_FILE } from './constants.ts';

/**
 * An object capable of dispatching RPC method calls.
 * Typically backed by an RpcService, but abstracted to avoid
 * importing cycle-inducing handler packages.
 */
export type RpcDispatcher = {
  assertHasMethod(method: string): void;
  execute(method: string, params: unknown): Promise<unknown>;
};

/**
 * Options for creating the daemon RPC server.
 */
type DaemonServerOptions = {
  rpcDispatcher: RpcDispatcher;
  logger: Logger;
  onShutdown: () => Promise<void>;
};

/**
 * Create and start the Unix domain socket RPC server.
 *
 * @param options - Options for the daemon server.
 * @param options.rpcDispatcher - The RPC dispatcher for handling method calls.
 * @param options.logger - Logger instance.
 * @param options.onShutdown - Callback invoked on shutdown RPC.
 * @returns The running server instance.
 */
export function createDaemonServer({
  rpcDispatcher,
  logger,
  onShutdown,
}: DaemonServerOptions): Server {
  const server = createServer((connection: Socket) => {
    logger.debug('Client connected');
    let buffer = '';

    connection.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleMessage(
          connection,
          rpcDispatcher,
          line,
          logger,
          onShutdown,
        ).catch((error) => logger.error('Error handling message', error));
      }
    });

    connection.on('error', (error) => {
      logger.debug('Client connection error', error);
    });

    connection.on('close', () => {
      logger.debug('Client disconnected');
    });
  });

  server.listen(SOCK_FILE, () => {
    logger.info(`Daemon server listening on ${SOCK_FILE}`);
  });

  return server;
}

/**
 * Handle a single JSON-RPC message from a client connection.
 *
 * @param connection - The client socket connection.
 * @param rpcDispatcher - The RPC dispatcher for handling method calls.
 * @param line - The raw JSON-RPC message string.
 * @param logger - Logger instance.
 * @param onShutdown - Callback for shutdown requests.
 */
async function handleMessage(
  connection: Socket,
  rpcDispatcher: RpcDispatcher,
  line: string,
  logger: Logger,
  onShutdown: () => Promise<void>,
): Promise<void> {
  let parsed: {
    id?: string | number | null;
    method?: string;
    params?: unknown;
  };
  try {
    parsed = JSON.parse(line);
  } catch {
    const response = {
      jsonrpc: '2.0' as const,
      id: null,
      error: { code: -32700, message: 'Parse error' },
    };
    connection.write(`${JSON.stringify(response)}\n`);
    return;
  }

  const { id, method, params } = parsed;

  if (!method) {
    const response = {
      jsonrpc: '2.0' as const,
      id,
      error: { code: -32600, message: 'Invalid Request: missing method' },
    };
    connection.write(`${JSON.stringify(response)}\n`);
    return;
  }

  if (method === 'shutdown') {
    const response = { jsonrpc: '2.0' as const, id, result: true };
    connection.write(`${JSON.stringify(response)}\n`);
    await onShutdown();
    return;
  }

  try {
    rpcDispatcher.assertHasMethod(method);
    const result = await rpcDispatcher.execute(method, params);
    const response = { jsonrpc: '2.0' as const, id, result };
    connection.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    logger.error(`RPC error for method ${method}`, error);
    const response = {
      jsonrpc: '2.0' as const,
      id,
      error: {
        code: (error as { code?: number }).code ?? -32603,
        message: (error as Error).message,
      },
    };
    connection.write(`${JSON.stringify(response)}\n`);
  }
}
