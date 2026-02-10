import { RpcClient } from '@metamask/kernel-rpc-methods';
import type { Logger } from '@metamask/logger';
import { createConnection } from 'node:net';

import { SOCK_FILE } from './constants.ts';
import type { DaemonConnection } from './types.ts';

/**
 * Connect to the daemon's Unix domain socket and return an RPC client.
 *
 * @param methodSpecs - RPC method specifications for the client (e.g. rpcMethodSpecs
 * from kernel-browser-runtime). Passed as a parameter to avoid cyclic dependencies.
 * @param logger - Logger instance.
 * @returns A daemon connection with an RPC client and close function.
 */
export async function connectToDaemon(
  methodSpecs: Record<string, { method: string }>,
  logger: Logger,
): Promise<DaemonConnection> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCK_FILE);

    socket.once('connect', () => {
      const sendMessage = async (
        payload: Record<string, unknown>,
      ): Promise<void> => {
        socket.write(`${JSON.stringify(payload)}\n`);
      };

      const client = new RpcClient(
        methodSpecs as never,
        sendMessage,
        'cli-',
        logger,
      );

      let buffer = '';
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          try {
            const response = JSON.parse(line);
            if (response.id !== undefined && response.id !== null) {
              client.handleResponse(String(response.id), response);
            }
          } catch {
            logger.error('Failed to parse daemon response');
          }
        }
      });

      resolve({
        client,
        socket,
        close: () => {
          socket.removeAllListeners();
          socket.destroy();
        },
      });
    });

    socket.once('error', (error) => {
      reject(new Error(`Failed to connect to daemon: ${error.message}`));
    });
  });
}

/**
 * Send a raw shutdown command to the daemon over the Unix socket.
 * This bypasses the typed RPC client since `shutdown` is daemon-specific.
 *
 * @returns A promise that resolves when the shutdown acknowledgment is received.
 */
export async function sendShutdown(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCK_FILE);

    socket.once('connect', () => {
      const request = {
        jsonrpc: '2.0',
        id: 'shutdown-1',
        method: 'shutdown',
        params: [],
      };
      socket.write(`${JSON.stringify(request)}\n`);

      let buffer = '';
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.includes('\n')) {
          socket.destroy();
          resolve();
        }
      });
    });

    socket.once('error', (error) => {
      reject(new Error(`Failed to connect to daemon: ${error.message}`));
    });
  });
}
