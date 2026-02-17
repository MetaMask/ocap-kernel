import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { Kernel, IOChannel, IOConfig } from '@metamask/ocap-kernel';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';

const SYSTEM_CONSOLE_NAME = 'system-console';

/**
 * Generate a unique temp socket path.
 *
 * @returns A unique socket path.
 */
function tempSocketPath(): string {
  return join(
    tmpdir(),
    `daemon-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`,
  );
}

/**
 * Connect to a UNIX socket.
 *
 * @param socketPath - The socket path.
 * @returns The connected socket.
 */
async function connectToSocket(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.removeListener('error', reject);
      resolve(client);
    });
    client.on('error', reject);
  });
}

/**
 * Write a newline-delimited line to a socket.
 *
 * @param socket - The socket.
 * @param line - The line to write.
 */
async function writeLine(socket: net.Socket, line: string): Promise<void> {
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
 * Read a newline-delimited line from a socket.
 *
 * @param socket - The socket.
 * @returns The line read.
 */
async function readLine(socket: net.Socket): Promise<string> {
  return new Promise((resolve) => {
    let buffer = '';
    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        socket.removeListener('data', onData);
        resolve(buffer.slice(0, idx));
      }
    };
    socket.on('data', onData);
  });
}

/**
 * Send a JSON request over a socket and read the JSON response.
 *
 * @param socketPath - The socket path.
 * @param request - The request object.
 * @returns The parsed response.
 */
async function sendCommand(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const socket = await connectToSocket(socketPath);
  try {
    await writeLine(socket, JSON.stringify(request));
    const responseLine = await readLine(socket);
    return JSON.parse(responseLine) as {
      ok: boolean;
      result?: unknown;
      error?: string;
    };
  } finally {
    socket.destroy();
  }
}

/**
 * Create a test socket IO channel factory.
 *
 * @returns The factory function.
 */
function makeTestIOChannelFactory() {
  const fsPromises = import('node:fs/promises');

  return async (_name: string, config: IOConfig): Promise<IOChannel> => {
    if (config.type !== 'socket') {
      throw new Error(`unsupported IO type: ${config.type}`);
    }
    const fs = await fsPromises;
    const lineQueue: string[] = [];
    const readerQueue: { resolve: (value: string | null) => void }[] = [];
    let currentSocket: net.Socket | null = null;
    let lineBuffer = '';
    let closed = false;

    function deliverLine(line: string): void {
      const reader = readerQueue.shift();
      if (reader) {
        reader.resolve(line);
      } else {
        lineQueue.push(line);
      }
    }

    function deliverEOF(): void {
      while (readerQueue.length > 0) {
        readerQueue.shift()?.resolve(null);
      }
    }

    const server = net.createServer((socket) => {
      if (currentSocket) {
        socket.destroy();
        return;
      }
      currentSocket = socket;
      lineBuffer = '';
      socket.on('data', (data: Buffer) => {
        lineBuffer += data.toString();
        let idx = lineBuffer.indexOf('\n');
        while (idx !== -1) {
          deliverLine(lineBuffer.slice(0, idx));
          lineBuffer = lineBuffer.slice(idx + 1);
          idx = lineBuffer.indexOf('\n');
        }
      });
      socket.on('end', () => {
        if (lineBuffer.length > 0) {
          deliverLine(lineBuffer);
          lineBuffer = '';
        }
        currentSocket = null;
        deliverEOF();
      });
      socket.on('error', () => {
        currentSocket = null;
        deliverEOF();
      });
    });

    try {
      await fs.unlink(config.path);
    } catch {
      // ignore
    }

    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(config.path, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

    return {
      async read() {
        if (closed) {
          return null;
        }
        const queued = lineQueue.shift();
        if (queued !== undefined) {
          return queued;
        }
        if (!currentSocket) {
          return null;
        }
        return new Promise<string | null>((resolve) => {
          readerQueue.push({ resolve });
        });
      },
      async write(data: string) {
        if (!currentSocket) {
          throw new Error('no connected client');
        }
        const socket = currentSocket;
        return new Promise<void>((resolve, reject) => {
          socket.write(`${data}\n`, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      },
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        deliverEOF();
        currentSocket?.destroy();
        currentSocket = null;
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
        try {
          await fs.unlink(config.path);
        } catch {
          // ignore
        }
      },
    };
  };
}

/**
 * Get the bundle spec for the system console vat test bundle.
 *
 * @returns The bundle spec URL.
 */
function getSystemConsoleBundleSpec(): string {
  const bundlePath = join(
    import.meta.dirname,
    '../vats/system-console-vat.bundle',
  );
  return pathToFileURL(bundlePath).href;
}

describe('Daemon Stack (IO socket protocol)', { timeout: 30_000 }, () => {
  let kernel: Kernel | undefined;
  let kernelDatabase: KernelDatabase | undefined;

  /**
   * Boot a kernel with a system console subcluster using IO socket.
   *
   * @returns The socket path.
   */
  async function bootDaemonStack(): Promise<string> {
    const socketPath = tempSocketPath();

    kernelDatabase = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    kernel = await makeTestKernel(kernelDatabase, {
      ioChannelFactory: makeTestIOChannelFactory(),
      systemSubclusters: [
        {
          name: SYSTEM_CONSOLE_NAME,
          config: {
            bootstrap: SYSTEM_CONSOLE_NAME,
            io: {
              console: {
                type: 'socket' as const,
                path: socketPath,
              },
            },
            services: ['kernelFacet', 'console'],
            vats: {
              [SYSTEM_CONSOLE_NAME]: {
                bundleSpec: getSystemConsoleBundleSpec(),
                parameters: { name: SYSTEM_CONSOLE_NAME },
              },
            },
          },
        },
      ],
    });

    await kernel.initIdentity();
    await waitUntilQuiescent(100);

    return socketPath;
  }

  afterEach(async () => {
    if (kernel) {
      const stopResult = kernel.stop();
      kernel = undefined;
      await stopResult;
    }
    if (kernelDatabase) {
      kernelDatabase.close();
      kernelDatabase = undefined;
    }
  });

  it('dispatches help command via socket', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendCommand(socketPath, { method: 'help' });

    expect(response.ok).toBe(true);
    const result = response.result as { commands: string[] };
    expect(result.commands).toBeDefined();
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.commands.some((cmd) => cmd.includes('help'))).toBe(true);
    expect(result.commands.some((cmd) => cmd.includes('status'))).toBe(true);
  });

  it('dispatches status command via socket', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendCommand(socketPath, { method: 'status' });

    expect(response.ok).toBe(true);
  });

  it('dispatches listRefs command', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendCommand(socketPath, { method: 'listRefs' });

    expect(response.ok).toBe(true);
    const result = response.result as { refs: { ref: string; kref: string }[] };
    expect(result.refs).toBeDefined();
    expect(Array.isArray(result.refs)).toBe(true);
  });

  it('returns error for unknown command', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendCommand(socketPath, { method: 'nonexistent' });

    expect(response.ok).toBe(false);
    expect(response.error).toContain('Unknown command');
  });

  it('handles sequential requests on separate connections', async () => {
    const socketPath = await bootDaemonStack();

    const response1 = await sendCommand(socketPath, { method: 'help' });
    expect(response1.ok).toBe(true);

    const response2 = await sendCommand(socketPath, { method: 'status' });
    expect(response2.ok).toBe(true);
  });
});
