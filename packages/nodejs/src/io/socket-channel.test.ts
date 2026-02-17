import type { IOChannel } from '@metamask/ocap-kernel';
import fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';

import { makeSocketIOChannel } from './socket-channel.ts';

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

describe('makeSocketIOChannel', () => {
  const channels: IOChannel[] = [];
  const clients: net.Socket[] = [];

  afterEach(async () => {
    for (const client of clients) {
      client.destroy();
    }
    clients.length = 0;
    for (const channel of channels) {
      await channel.close();
    }
    channels.length = 0;
  });

  it('creates a listening socket', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    expect(await fileExists(socketPath)).toBe(true);
  });

  it('reads lines from a connected client', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    const client = await connectToSocket(socketPath);
    clients.push(client);

    await writeLine(client, 'hello');
    await writeLine(client, 'world');

    const line1 = await channel.read();
    const line2 = await channel.read();

    expect(line1).toBe('hello');
    expect(line2).toBe('world');
  });

  it('writes lines to a connected client', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    const client = await connectToSocket(socketPath);
    clients.push(client);

    // Small delay for connection to be established
    await new Promise((resolve) => setTimeout(resolve, 10));

    const linePromise = readLine(client);
    await channel.write('output');
    const received = await linePromise;

    expect(received).toBe('output');
  });

  it('returns null on client disconnect', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    const client = await connectToSocket(socketPath);

    // Start a read that will block
    const readPromise = channel.read();
    client.destroy();

    const result = await readPromise;
    expect(result).toBeNull();
  });

  it('blocks read until a client connects and sends data', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    // Start read before any client connects — should block
    const readPromise = channel.read();

    // Connect and send data
    const client = await connectToSocket(socketPath);
    clients.push(client);
    await writeLine(client, 'hello');

    const result = await readPromise;
    expect(result).toBe('hello');
  });

  it('throws on write when no client is connected', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    await expect(channel.write('data')).rejects.toThrow(
      'has no connected client',
    );
  });

  it('queues lines before read is called', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    const client = await connectToSocket(socketPath);
    clients.push(client);

    // Send lines before any reads
    await writeLine(client, 'a');
    await writeLine(client, 'b');

    // Small delay for data to arrive
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await channel.read()).toBe('a');
    expect(await channel.read()).toBe('b');
  });

  it('rejects second connection', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    const client1 = await connectToSocket(socketPath);
    clients.push(client1);

    const client2 = await connectToSocket(socketPath);

    // Second client should be destroyed
    await new Promise<void>((resolve) => {
      client2.on('close', () => resolve());
    });
    expect(client2.destroyed).toBe(true);
  });

  it('cleans up socket file on close', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);

    expect(await fileExists(socketPath)).toBe(true);
    await channel.close();
    expect(await fileExists(socketPath)).toBe(false);
  });

  it('returns null after close', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);

    await channel.close();

    const result = await channel.read();
    expect(result).toBeNull();
  });

  it('throws on write after close', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    const client = await connectToSocket(socketPath);
    clients.push(client);

    await channel.close();

    await expect(channel.write('data')).rejects.toThrow('is closed');
  });

  it('drains stale lineQueue when a new client connects', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    // First client sends lines that are not read
    const client1 = await connectToSocket(socketPath);
    await writeLine(client1, 'stale-line');
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Disconnect first client
    client1.destroy();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Second client connects — stale lines should be gone
    const client2 = await connectToSocket(socketPath);
    clients.push(client2);

    await writeLine(client2, 'fresh-line');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await channel.read()).toBe('fresh-line');
  });

  it('handles multi-byte UTF-8 split across TCP chunks', async () => {
    const socketPath = tempSocketPath();
    const channel = await makeSocketIOChannel('test', socketPath);
    channels.push(channel);

    const client = await connectToSocket(socketPath);
    clients.push(client);

    // U+1F600 (😀) is 4 bytes: f0 9f 98 80
    const emoji = '\u{1F600}';
    const fullMessage = `hello ${emoji} world\n`;
    const encoded = Buffer.from(fullMessage, 'utf8');

    // Split in the middle of the emoji (after first 2 bytes of the 4-byte sequence)
    const splitPoint = Buffer.from('hello ', 'utf8').length + 2;
    const chunk1 = encoded.subarray(0, splitPoint);
    const chunk2 = encoded.subarray(splitPoint);

    // Send the two chunks separately
    await new Promise<void>((resolve, reject) => {
      client.write(chunk1, (error) => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise<void>((resolve, reject) => {
      client.write(chunk2, (error) => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(await channel.read()).toBe(`hello ${emoji} world`);
  });

  it('removes stale socket file on creation', async () => {
    const socketPath = tempSocketPath();

    // Create the first channel
    const channel1 = await makeSocketIOChannel('test', socketPath);
    await channel1.close();

    // Recreate a stale file
    await fs.writeFile(socketPath, '');

    // Should succeed despite the stale file
    const channel2 = await makeSocketIOChannel('test', socketPath);
    channels.push(channel2);

    expect(await fileExists(socketPath)).toBe(true);
  });
});
