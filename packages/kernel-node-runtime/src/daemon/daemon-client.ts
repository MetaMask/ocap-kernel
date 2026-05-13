import { getOcapHome } from '@metamask/kernel-utils/nodejs';
import type {
  Decision,
  SectionNotification,
} from '@metamask/kernel-utils/session';
import { NodeSocketDuplexStream } from '@metamask/streams';
import type { JsonRpcResponse } from '@metamask/utils';
import { assertIsJsonRpcResponse } from '@metamask/utils';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';

import { readLine, writeLine } from './socket-line.ts';

/**
 * Get the default daemon socket path.
 *
 * @returns The socket path.
 */
export function getSocketPath(): string {
  return join(getOcapHome(), 'daemon.sock');
}

/**
 * Get the default daemon stream socket path.
 *
 * @returns The stream socket path.
 */
export function getStreamSocketPath(): string {
  return join(getOcapHome(), 'daemon-stream.sock');
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
export type SendCommandOptions = {
  /** The UNIX socket path. */
  socketPath: string;
  /** The RPC method name. */
  method: string;
  /** Optional method parameters (object or positional array). */
  params?: Record<string, unknown> | unknown[] | undefined;
  /** Read timeout in milliseconds (default: no timeout). */
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
 * @param options.timeoutMs - Read timeout in milliseconds (default: no timeout).
 * @returns The parsed JSON-RPC response.
 */
export async function sendCommand({
  socketPath,
  method,
  params,
  timeoutMs,
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
 * Connect to the daemon's stream socket and return a typed duplex stream for
 * receiving {@link SectionNotification} values and sending {@link Decision}
 * values.
 *
 * Sends a one-line JSON handshake carrying the OCAP URL, then performs the
 * SYN/ACK synchronization required by {@link NodeSocketDuplexStream}.
 *
 * @param streamSocketPath - The stream server socket path.
 * @param ocapUrl - The OCAP URL identifying the target channel.
 * @returns A synchronized duplex stream.
 */
export async function connectModalStream(
  streamSocketPath: string,
  ocapUrl: string,
): Promise<NodeSocketDuplexStream<SectionNotification, Decision>> {
  const socket = await connectSocket(streamSocketPath);
  await writeLine(socket, JSON.stringify({ ocapUrl }));
  // Wait for server ACK before starting stream synchronize — prevents the
  // SYN bytes from being consumed by the server's readLine handshake buffer.
  await readLine(socket);
  return NodeSocketDuplexStream.make<SectionNotification, Decision>(socket);
}
