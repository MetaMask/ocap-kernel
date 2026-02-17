import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { Kernel } from '@metamask/ocap-kernel';
import { kunser } from '@metamask/ocap-kernel';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';

import { makeIOChannelFactory } from '../../src/io/index.ts';
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
      ioChannelFactory: makeIOChannelFactory(),
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

  describe('daemon tier (no ref)', () => {
    it('dispatches help command with daemon-tier commands only', async () => {
      const socketPath = await bootDaemonStack();

      const response = await sendCommand(socketPath, { method: 'help' });

      expect(response.ok).toBe(true);
      expect(response.result).toStrictEqual({
        commands: ['help - show available commands', 'status - daemon status'],
      });
    });

    it('dispatches status command returning liveness indicator', async () => {
      const socketPath = await bootDaemonStack();

      const response = await sendCommand(socketPath, { method: 'status' });

      expect(response).toStrictEqual({
        ok: true,
        result: { running: true },
      });
    });

    it('returns error for unknown command', async () => {
      const socketPath = await bootDaemonStack();

      const response = await sendCommand(socketPath, {
        method: 'nonexistent',
      });

      expect(response.ok).toBe(false);
      expect(response.error).toContain('Unknown command');
    });

    it('rejects privileged commands at daemon tier', async () => {
      const socketPath = await bootDaemonStack();

      const response = await sendCommand(socketPath, { method: 'ls' });

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

  describe('privileged tier (ref-based dispatch)', () => {
    /**
     * Boot daemon and issue a self-ref for the console root object.
     *
     * @returns The socket path and the issued ref.
     */
    async function bootWithSelfRef(): Promise<{
      socketPath: string;
      selfRef: string;
    }> {
      const socketPath = await bootDaemonStack();

      // Issue a self-ref via kernel API (same as start-daemon.ts does)
      const rootKref = kernel!.getSystemSubclusterRoot(SYSTEM_CONSOLE_NAME);
      const capData = await kernel!.queueMessage(rootKref, 'issueRef', [
        rootKref,
        true,
      ]);
      const selfRef = kunser(capData) as string;

      return { socketPath, selfRef };
    }

    it('dispatches help via ref', async () => {
      const { socketPath, selfRef } = await bootWithSelfRef();

      const response = await sendCommand(socketPath, {
        ref: selfRef,
        method: 'help',
      });

      expect(response.ok).toBe(true);
      const result = response.result as { commands: string[] };
      expect(result.commands).toContain('help - show available commands');
      expect(result.commands).toContain('ls - list all issued refs');
    });

    it('dispatches status via ref (returns kernel status)', async () => {
      const { socketPath, selfRef } = await bootWithSelfRef();

      const response = await sendCommand(socketPath, {
        ref: selfRef,
        method: 'status',
      });

      expect(response.ok).toBe(true);
      const result = response.result as Record<string, unknown>;
      expect(result).toHaveProperty('vats');
      expect(result).toHaveProperty('subclusters');
    });

    it('dispatches ls via ref', async () => {
      const { socketPath, selfRef } = await bootWithSelfRef();

      const response = await sendCommand(socketPath, {
        ref: selfRef,
        method: 'ls',
      });

      expect(response.ok).toBe(true);
      const result = response.result as { refs: string[] };
      expect(Array.isArray(result.refs)).toBe(true);
    });

    it('dispatches subclusters via ref', async () => {
      const { socketPath, selfRef } = await bootWithSelfRef();

      const response = await sendCommand(socketPath, {
        ref: selfRef,
        method: 'subclusters',
      });

      expect(response.ok).toBe(true);
      expect(Array.isArray(response.result)).toBe(true);
    });

    it('dispatches invoke to call method on a ref through the kernel', async () => {
      const { socketPath, selfRef } = await bootWithSelfRef();

      // Use invoke to call 'ls' on the self-ref (goes through getPresence + E())
      const response = await sendCommand(socketPath, {
        ref: selfRef,
        method: 'invoke',
        args: [selfRef, 'ls'],
      });

      expect(response.ok).toBe(true);
      const result = response.result as { refs: string[] };
      expect(Array.isArray(result.refs)).toBe(true);
    });

    it('returns error when invoke targets unknown ref', async () => {
      const { socketPath, selfRef } = await bootWithSelfRef();

      const response = await sendCommand(socketPath, {
        ref: selfRef,
        method: 'invoke',
        args: ['d-999', 'someMethod'],
      });

      expect(response.ok).toBe(false);
      expect(response.error).toContain('Unknown ref: d-999');
    });
  });
});
