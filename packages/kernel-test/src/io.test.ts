import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel } from '@metamask/ocap-kernel';
import type { IOChannel, IOConfig } from '@metamask/ocap-kernel';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import { getBundleSpec, makeTestLogger } from './utils.ts';

function tempSocketPath(): string {
  return path.join(
    os.tmpdir(),
    `io-int-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`,
  );
}

async function connectToSocket(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.removeListener('error', reject);
      resolve(client);
    });
    client.on('error', reject);
  });
}

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

async function makeTestSocketChannel(
  _name: string,
  socketPath: string,
): Promise<IOChannel> {
  const fsPromises = await import('node:fs/promises');
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
    await fsPromises.unlink(socketPath);
  } catch {
    // ignore
  }

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
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
        await fsPromises.unlink(socketPath);
      } catch {
        // ignore
      }
    },
  };
}

describe('IO kernel service', () => {
  const clients: net.Socket[] = [];

  afterEach(async () => {
    for (const client of clients) {
      client.destroy();
    }
    clients.length = 0;
  });

  it('reads and writes through an IO channel', async () => {
    const socketPath = tempSocketPath();
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    const { logger } = makeTestLogger();

    const { NodejsPlatformServices } = await import('@ocap/nodejs');
    const kernel = await Kernel.make(
      new NodejsPlatformServices({
        logger: logger.subLogger({ tags: ['platform'] }),
      }),
      kernelDatabase,
      {
        resetStorage: true,
        logger,
        ioChannelFactory: async (name: string, config: IOConfig) => {
          if (config.type !== 'socket') {
            throw new Error(`unsupported: ${config.type}`);
          }
          return makeTestSocketChannel(name, config.path);
        },
      },
    );

    const config = {
      bootstrap: 'io',
      forceReset: true,
      io: {
        repl: {
          type: 'socket' as const,
          path: socketPath,
        },
      },
      services: ['repl'],
      vats: {
        io: {
          bundleSpec: getBundleSpec('io-vat'),
          parameters: { name: 'io' },
        },
      },
    };

    const { rootKref } = await kernel.launchSubcluster(config);
    await waitUntilQuiescent();

    // Connect to the socket
    const client = await connectToSocket(socketPath);
    clients.push(client);

    // Small delay for connection setup
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Send a line from the test to the vat
    await writeLine(client, 'hello from test');

    // Trigger the vat to read and verify it received the data
    await kernel.queueMessage(rootKref, 'doRead', []);
    await waitUntilQuiescent(100);

    const bufferResult = await kernel.queueMessage(
      rootKref,
      'getReadBuffer',
      [],
    );
    await waitUntilQuiescent(100);
    expect(bufferResult.body).toContain('hello from test');

    // Trigger the vat to write
    const linePromise = readLine(client);
    await kernel.queueMessage(rootKref, 'doWrite', ['hello from vat']);
    await waitUntilQuiescent(100);

    const received = await linePromise;
    expect(received).toBe('hello from vat');
  });
});
