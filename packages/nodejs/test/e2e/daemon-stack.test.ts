import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import type { Kernel } from '@metamask/ocap-kernel';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import type { RpcSocketServerHandle } from '../../src/daemon/index.ts';
import { startRpcSocketServer } from '../../src/daemon/index.ts';
import { makeTestKernel } from '../helpers/kernel.ts';

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
 * A JSON-RPC 2.0 response.
 */
type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

/**
 * Send a JSON-RPC request over a socket and read the JSON-RPC response.
 *
 * @param socketPath - The socket path.
 * @param method - The RPC method name.
 * @param params - Optional method parameters.
 * @returns The parsed JSON-RPC response.
 */
async function sendJsonRpc(
  socketPath: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const socket = await connectToSocket(socketPath);
  try {
    const request = {
      jsonrpc: '2.0',
      id: '1',
      method,
      ...(params === undefined ? {} : { params }),
    };
    await writeLine(socket, JSON.stringify(request));
    const responseLine = await readLine(socket);
    return JSON.parse(responseLine) as JsonRpcResponse;
  } finally {
    socket.destroy();
  }
}

describe('Daemon Stack (JSON-RPC socket protocol)', { timeout: 30_000 }, () => {
  let kernel: Kernel | undefined;
  let kernelDatabase: KernelDatabase | undefined;
  let rpcServer: RpcSocketServerHandle | undefined;

  /**
   * Boot a kernel with an RPC socket server.
   *
   * @returns The socket path.
   */
  async function bootDaemonStack(): Promise<string> {
    const socketPath = tempSocketPath();

    kernelDatabase = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    kernel = await makeTestKernel(kernelDatabase);
    await kernel.initIdentity();

    rpcServer = await startRpcSocketServer({
      socketPath,
      kernel,
      kernelDatabase,
    });

    return socketPath;
  }

  afterEach(async () => {
    if (rpcServer) {
      const toClose = rpcServer;
      rpcServer = undefined;
      await toClose.close();
    }
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

  it('returns kernel status via getStatus', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendJsonRpc(socketPath, 'getStatus');

    expect(response.jsonrpc).toBe('2.0');
    expect(response.error).toBeUndefined();
    expect(response.result).toBeDefined();
    const result = response.result as Record<string, unknown>;
    expect(result).toHaveProperty('vats');
    expect(result).toHaveProperty('subclusters');
  });

  it('returns error for unknown method', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendJsonRpc(socketPath, 'nonexistentMethod');

    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
  });

  it('executes DB query', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendJsonRpc(socketPath, 'executeDBQuery', {
      sql: 'SELECT key, value FROM kv LIMIT 5',
    });

    expect(response.error).toBeUndefined();
    expect(Array.isArray(response.result)).toBe(true);
  });

  it('handles sequential requests on separate connections', async () => {
    const socketPath = await bootDaemonStack();

    const response1 = await sendJsonRpc(socketPath, 'getStatus');
    expect(response1.error).toBeUndefined();
    expect(response1.result).toBeDefined();

    const response2 = await sendJsonRpc(socketPath, 'getStatus');
    expect(response2.error).toBeUndefined();
    expect(response2.result).toBeDefined();
  });

  it('terminates all vats', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendJsonRpc(socketPath, 'terminateAllVats');

    expect(response.error).toBeUndefined();
  });

  it('returns proper JSON-RPC error structure', async () => {
    const socketPath = await bootDaemonStack();

    const response = await sendJsonRpc(socketPath, 'nonexistent');

    expect(response).toStrictEqual({
      jsonrpc: '2.0',
      id: '1',
      error: expect.objectContaining({
        code: expect.any(Number),
        message: expect.any(String),
      }),
    });
  });
});
