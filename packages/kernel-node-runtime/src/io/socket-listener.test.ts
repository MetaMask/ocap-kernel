import type { IOChannel, IOListener } from '@metamask/ocap-kernel';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  makeConnectionChannel,
  makeSocketIOListener,
} from './socket-listener.ts';

function tempSocketPath(): string {
  return path.join(
    os.tmpdir(),
    `io-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`,
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const settle = async (ms = 20): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('makeSocketIOListener', () => {
  const listeners: IOListener[] = [];
  const clients: net.Socket[] = [];

  afterEach(async () => {
    for (const client of clients) {
      client.destroy();
    }
    clients.length = 0;
    for (const listener of listeners) {
      await listener.close();
    }
    listeners.length = 0;
  });

  /**
   * Create a listener that is torn down after the test.
   *
   * @param socketPath - Path for the Unix domain socket.
   * @returns The listener.
   */
  async function makeTracked(socketPath: string): Promise<IOListener> {
    const listener = await makeSocketIOListener('test', socketPath);
    listeners.push(listener);
    return listener;
  }

  /**
   * Connect a client that is destroyed after the test.
   *
   * @param socketPath - Path for the Unix domain socket.
   * @returns The connected client socket.
   */
  async function connectTracked(socketPath: string): Promise<net.Socket> {
    const client = await connectToSocket(socketPath);
    clients.push(client);
    return client;
  }

  it('creates a listening socket', async () => {
    const socketPath = tempSocketPath();
    await makeTracked(socketPath);

    expect(await fileExists(socketPath)).toBe(true);
  });

  describe('accept()', () => {
    it('yields a channel for a connecting peer', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const acceptPromise = listener.accept();
      const client = await connectTracked(socketPath);
      await writeLine(client, 'hello');

      const channel = await acceptPromise;
      expect(await channel?.read()).toBe('hello');
    });

    it('queues peers that connect before accept is called', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectTracked(socketPath);
      await writeLine(client, 'early');
      await settle();

      const channel = await listener.accept();
      expect(await channel?.read()).toBe('early');
    });

    it('yields one channel per peer, in connection order', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const first = await connectTracked(socketPath);
      await settle();
      const second = await connectTracked(socketPath);
      await settle();

      const channelA = await listener.accept();
      const channelB = await listener.accept();
      await writeLine(first, 'from-first');
      await writeLine(second, 'from-second');

      expect(await channelA?.read()).toBe('from-first');
      expect(await channelB?.read()).toBe('from-second');
    });

    it('returns null once the listener is closed', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeSocketIOListener('test', socketPath);

      await listener.close();

      expect(await listener.accept()).toBeNull();
    });

    it('releases a pending accept when the listener closes', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeSocketIOListener('test', socketPath);

      const acceptPromise = listener.accept();
      await listener.close();

      expect(await acceptPromise).toBeNull();
    });
  });

  describe('concurrent connections', () => {
    it('serves several peers at once without mixing their data', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const alice = await connectTracked(socketPath);
      await settle();
      const bob = await connectTracked(socketPath);
      await settle();

      const aliceChannel = (await listener.accept()) as IOChannel;
      const bobChannel = (await listener.accept()) as IOChannel;

      // Interleave traffic from both peers.
      await writeLine(alice, 'alice-1');
      await writeLine(bob, 'bob-1');
      await writeLine(alice, 'alice-2');
      await writeLine(bob, 'bob-2');
      await settle();

      expect(await aliceChannel.read()).toBe('alice-1');
      expect(await aliceChannel.read()).toBe('alice-2');
      expect(await bobChannel.read()).toBe('bob-1');
      expect(await bobChannel.read()).toBe('bob-2');
    });

    it('routes each write back to its own peer', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const alice = await connectTracked(socketPath);
      await settle();
      const bob = await connectTracked(socketPath);
      await settle();

      const aliceChannel = (await listener.accept()) as IOChannel;
      const bobChannel = (await listener.accept()) as IOChannel;

      const aliceHeard = readLine(alice);
      const bobHeard = readLine(bob);
      await aliceChannel.write('for-alice');
      await bobChannel.write('for-bob');

      expect(await aliceHeard).toBe('for-alice');
      expect(await bobHeard).toBe('for-bob');
    });

    it('leaves one peer unaffected when another disconnects', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const doomed = await connectToSocket(socketPath);
      await settle();
      const survivor = await connectTracked(socketPath);
      await settle();

      const doomedChannel = (await listener.accept()) as IOChannel;
      const survivorChannel = (await listener.accept()) as IOChannel;

      doomed.destroy();
      await settle();

      expect(await doomedChannel.read()).toBeNull();
      await writeLine(survivor, 'still-here');
      expect(await survivorChannel.read()).toBe('still-here');
    });
  });

  describe('connection channels', () => {
    it('writes lines to its peer', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      const linePromise = readLine(client);
      await channel.write('output');

      expect(await linePromise).toBe('output');
    });

    it('queues lines that arrive before read is called', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      await writeLine(client, 'a');
      await writeLine(client, 'b');
      await settle();

      expect(await channel.read()).toBe('a');
      expect(await channel.read()).toBe('b');
    });

    it('returns null to a pending read when the peer disconnects', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectToSocket(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      const readPromise = channel.read();
      client.destroy();

      expect(await readPromise).toBeNull();
    });

    it('delivers buffered lines before reporting EOF', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectToSocket(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      await writeLine(client, 'last-words');
      await settle();
      client.destroy();
      await settle();

      // Data the peer sent before going away is not lost.
      expect(await channel.read()).toBe('last-words');
      expect(await channel.read()).toBeNull();
    });

    it('returns null after the channel is closed', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;
      await channel.close();

      expect(await channel.read()).toBeNull();
    });

    it('discards buffered data on close rather than delivering it after EOF', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      // A complete line plus a trailing fragment with no newline.
      await writeLine(client, 'buffered');
      await new Promise<void>((resolve, reject) => {
        client.write('partial-no-newline', (error) =>
          error ? reject(error) : resolve(),
        );
      });
      await settle();

      await channel.close();

      // Closing means the holder is done reading. Neither the queued line
      // nor the trailing fragment may surface after EOF was signalled.
      expect(await channel.read()).toBeNull();
      expect(await channel.read()).toBeNull();
    });

    it('throws on write after the channel is closed', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;
      await channel.close();

      await expect(channel.write('data')).rejects.toThrow('is closed');
    });

    it('handles multi-byte UTF-8 split across TCP chunks', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeTracked(socketPath);

      const client = await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      // U+1F600 (😀) is 4 bytes: f0 9f 98 80
      const emoji = '\u{1F600}';
      const encoded = Buffer.from(`hello ${emoji} world\n`, 'utf8');

      // Split in the middle of the emoji (after 2 of its 4 bytes)
      const splitPoint = Buffer.from('hello ', 'utf8').length + 2;

      await new Promise<void>((resolve, reject) => {
        client.write(encoded.subarray(0, splitPoint), (error) =>
          error ? reject(error) : resolve(),
        );
      });
      await settle(10);
      await new Promise<void>((resolve, reject) => {
        client.write(encoded.subarray(splitPoint), (error) =>
          error ? reject(error) : resolve(),
        );
      });
      await settle(10);

      expect(await channel.read()).toBe(`hello ${emoji} world`);
    });
  });

  describe('close()', () => {
    it('cleans up the socket file', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeSocketIOListener('test', socketPath);

      expect(await fileExists(socketPath)).toBe(true);
      await listener.close();
      expect(await fileExists(socketPath)).toBe(false);
    });

    it('closes the connections it handed out', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeSocketIOListener('test', socketPath);

      await connectTracked(socketPath);
      const channel = (await listener.accept()) as IOChannel;

      await listener.close();

      expect(await channel.read()).toBeNull();
      await expect(channel.write('data')).rejects.toThrow('is closed');
    });

    it('is idempotent', async () => {
      const socketPath = tempSocketPath();
      const listener = await makeSocketIOListener('test', socketPath);

      await listener.close();
      expect(await listener.close()).toBeUndefined();
    });
  });

  it('removes a stale socket file on creation', async () => {
    const socketPath = tempSocketPath();

    const first = await makeSocketIOListener('test', socketPath);
    await first.close();

    // Recreate a stale file
    await fs.writeFile(socketPath, '');

    // Should succeed despite the stale file
    await makeTracked(socketPath);

    expect(await fileExists(socketPath)).toBe(true);
  });
});

describe('makeConnectionChannel', () => {
  /**
   * A minimal stand-in for a connected socket: enough of the surface for
   * the channel to attach handlers, and emitters so a test can drive the
   * peer side directly.
   *
   * @returns The fake socket.
   */
  function makeFakeSocket(): net.Socket {
    const emitter = new EventEmitter();
    return Object.assign(emitter, {
      destroy: () => undefined,
      write: () => true,
    }) as unknown as net.Socket;
  }

  it('reports the connection closed when the holder closes it', async () => {
    const onClosed = vi.fn();
    const channel = makeConnectionChannel('c1', makeFakeSocket(), onClosed);

    await channel.close();

    // Without this the listener keeps the channel registered forever, so a
    // long-lived listener accumulates every session it ever served.
    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('reports the connection closed when the peer ends it', () => {
    const onClosed = vi.fn();
    const socket = makeFakeSocket();
    makeConnectionChannel('c1', socket, onClosed);

    socket.emit('end');

    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('reports closed only once across peer end and holder close', async () => {
    const onClosed = vi.fn();
    const socket = makeFakeSocket();
    const channel = makeConnectionChannel('c1', socket, onClosed);

    socket.emit('end');
    await channel.close();
    socket.emit('close');

    expect(onClosed).toHaveBeenCalledOnce();
  });

  it('flushes a trailing partial line when the peer ends', async () => {
    const channel = makeConnectionChannel(
      'c1',
      (() => {
        const peer = makeFakeSocket();
        setImmediate(() => {
          peer.emit('data', Buffer.from('no-newline-here'));
          peer.emit('end');
        });
        return peer;
      })(),
      vi.fn(),
    );

    // Data that arrived before the peer went away is still owed to the reader.
    expect(await channel.read()).toBe('no-newline-here');
    expect(await channel.read()).toBeNull();
  });

  it('discards a trailing partial line when the holder closes', async () => {
    const socket = makeFakeSocket();
    const channel = makeConnectionChannel('c1', socket, vi.fn());

    socket.emit('data', Buffer.from('no-newline-here'));
    await channel.close();

    expect(await channel.read()).toBeNull();
  });
});
