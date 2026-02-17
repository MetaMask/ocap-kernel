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
 * The response shape from the system console vat.
 */
export type ConsoleResponse = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Send a JSON request to the daemon over a UNIX socket and return the response.
 *
 * Opens a connection, writes one JSON line, reads one JSON response line,
 * then closes the connection. Retries once after a short delay if the
 * connection is rejected (e.g. due to a probe connection race).
 *
 * @param socketPath - The UNIX socket path.
 * @param request - The request to send.
 * @param request.ref - Optional ref targeting a capability.
 * @param request.method - The method name to invoke.
 * @param request.args - Optional arguments array.
 * @returns The parsed response.
 */
export async function sendCommand(
  socketPath: string,
  request: { ref?: string; method: string; args?: unknown[] },
): Promise<ConsoleResponse> {
  const attempt = async (): Promise<ConsoleResponse> => {
    const socket = await connectSocket(socketPath);
    try {
      await writeLine(socket, JSON.stringify(request));
      const responseLine = await readLine(socket);
      return JSON.parse(responseLine) as ConsoleResponse;
    } finally {
      socket.destroy();
    }
  };

  try {
    return await attempt();
  } catch {
    // Retry once after a short delay — the daemon's socket channel may
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

/**
 * Read all content from stdin, stripping shebang lines.
 *
 * @returns The stdin content with shebang lines removed.
 */
export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(chunks).toString().trim();
      const lines = raw.split('\n').filter((line) => !line.startsWith('#!'));
      resolve(lines.join('\n').trim());
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Read a ref from stdin. Strips shebang lines.
 *
 * @returns The ref string.
 */
export async function readRefFromStdin(): Promise<string> {
  const content = await readStdin();
  if (!content) {
    throw new Error('No ref found in stdin');
  }
  return content;
}

/**
 * Read a ref from a .ocap file. Strips shebang lines.
 *
 * @param filePath - The path to the .ocap file.
 * @returns The ref string.
 */
export async function readRefFromFile(filePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const raw = (await readFile(filePath, 'utf-8')).trim();
  const lines = raw.split('\n').filter((line) => !line.startsWith('#!'));
  const ref = lines.join('\n').trim();
  if (!ref) {
    throw new Error(`No ref found in ${filePath}`);
  }
  return ref;
}
