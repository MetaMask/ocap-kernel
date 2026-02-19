import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const READ_TIMEOUT_MS = 30_000;

/**
 * Get the default daemon socket path.
 *
 * @returns The socket path.
 */
export function getSocketPath(): string {
  return join(homedir(), '.ocap', 'console.sock');
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
 * Read a single newline-delimited line from a socket.
 *
 * @param socket - The socket to read from.
 * @returns The line read.
 */
async function readLine(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Daemon response timed out'));
    }, READ_TIMEOUT_MS);

    /**
     * Remove all listeners and clear the timeout.
     */
    function cleanup(): void {
      clearTimeout(timer);
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      socket.removeAllListeners('end');
      socket.removeAllListeners('close');
    }

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        cleanup();
        resolve(buffer.slice(0, idx));
      }
    };

    socket.on('data', onData);
    socket.once('error', (error) => {
      cleanup();
      reject(error);
    });
    socket.once('end', () => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    });
    socket.once('close', () => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    });
  });
}

/**
 * Write a newline-delimited line to a socket.
 *
 * @param socket - The socket to write to.
 * @param line - The line to write.
 */
async function writeLine(socket: Socket, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\n`, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * A JSON-RPC 2.0 response.
 */
export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

/**
 * Send a JSON-RPC request to the daemon over a UNIX socket and return the response.
 *
 * Opens a connection, writes one JSON-RPC request line, reads one JSON-RPC
 * response line, then closes the connection. Retries once after a short delay
 * if the connection is rejected (e.g. due to a probe connection race).
 *
 * @param socketPath - The UNIX socket path.
 * @param method - The RPC method name.
 * @param params - Optional method parameters.
 * @returns The parsed JSON-RPC response.
 */
export async function sendCommand(
  socketPath: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
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
      const responseLine = await readLine(socket);
      return JSON.parse(responseLine) as JsonRpcResponse;
    } finally {
      socket.destroy();
    }
  };

  try {
    return await attempt();
  } catch {
    // Retry once after a short delay — the daemon's socket may
    // still be cleaning up a previous probe connection.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return attempt();
  }
}

/**
 * Check whether the daemon is running by probing the socket.
 *
 * @param socketPath - The UNIX socket path.
 * @returns True if the daemon socket accepts a connection.
 */
export async function isDaemonRunning(socketPath: string): Promise<boolean> {
  try {
    const socket = await connectSocket(socketPath);
    socket.destroy();
    return true;
  } catch {
    return false;
  }
}
