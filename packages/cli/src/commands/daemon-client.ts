import type { JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse } from '@metamask/utils';
import { readLine, writeLine } from '@ocap/nodejs/daemon';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Get the default daemon socket path.
 *
 * @returns The socket path.
 */
export function getSocketPath(): string {
  return join(homedir(), '.ocap', 'daemon.sock');
}

/**
 * Connect to a UNIX domain socket.
 *
 * @param socketPath - The socket path to connect to.
 * @returns A connected socket.
 */
async function connectSocket(socketPath: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath, () => {
      socket.removeListener('error', reject);
      resolve(socket);
    });
    socket.on('error', reject);
  });
}

/**
 * Options for {@link sendCommand}.
 */
type SendCommandOptions = {
  /** The UNIX socket path. */
  socketPath: string;
  /** The RPC method name. */
  method: string;
  /** Optional method parameters. */
  params?: Record<string, unknown> | undefined;
  /** Read timeout in milliseconds (default: 30 000). */
  timeoutMs?: number | undefined;
};

/**
 * Send a JSON-RPC request to the daemon over a UNIX socket and return the response.
 *
 * Opens a connection, writes one JSON-RPC request line, reads one JSON-RPC
 * response line, then closes the connection. Retries once after a short delay
 * if the connection is rejected (e.g. due to a probe connection race).
 *
 * @param options - Command options.
 * @param options.socketPath - The UNIX socket path.
 * @param options.method - The RPC method name.
 * @param options.params - Optional method parameters.
 * @param options.timeoutMs - Read timeout in milliseconds (default: 30 000).
 * @returns The parsed JSON-RPC response.
 */
export async function sendCommand({
  socketPath,
  method,
  params,
  timeoutMs = 30_000,
}: SendCommandOptions): Promise<JsonRpcResponse> {
  const id = randomUUID();
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };

  const attempt = async (): Promise<JsonRpcResponse> => {
    const socket = await connectSocket(socketPath);
    try {
      await writeLine(socket, JSON.stringify(request));
      const responseLine = await readLine(socket, timeoutMs);
      const parsed: unknown = JSON.parse(responseLine);
      assertIsJsonRpcResponse(parsed);
      return parsed;
    } finally {
      socket.destroy();
    }
  };

  try {
    return await attempt();
  } catch (error: unknown) {
    // Retry once on connection errors only — the daemon's socket may
    // still be cleaning up a previous connection.
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ECONNREFUSED' && code !== 'ECONNRESET') {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    return attempt();
  }
}

/**
 * Check whether the daemon is running by sending a lightweight `getStatus`
 * RPC call. Unlike a bare socket probe, this avoids spurious connect/disconnect
 * noise on the server.
 *
 * @param socketPath - The UNIX socket path.
 * @returns True if the daemon responds to the RPC call.
 */
export async function pingDaemon(socketPath: string): Promise<boolean> {
  try {
    await sendCommand({ socketPath, method: 'getStatus', timeoutMs: 3_000 });
    return true;
  } catch {
    return false;
  }
}
