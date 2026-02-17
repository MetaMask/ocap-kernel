import type { IOChannel } from '@metamask/ocap-kernel';
import fs from 'node:fs/promises';
import * as net from 'node:net';
import { StringDecoder } from 'node:string_decoder';

type PendingReader = {
  resolve: (value: string | null) => void;
};

/**
 * Create an IOChannel backed by a Unix domain socket.
 *
 * Creates a `net.Server` listening on the configured socket path.
 * Accepts one connection at a time. Lines are `\n`-delimited.
 *
 * @param name - The channel name (for diagnostics).
 * @param socketPath - The file path for the Unix domain socket.
 * @returns A promise for the IOChannel, resolved once the server is listening.
 */
export async function makeSocketIOChannel(
  name: string,
  socketPath: string,
): Promise<IOChannel> {
  const lineQueue: string[] = [];
  const readerQueue: PendingReader[] = [];
  let currentSocket: net.Socket | null = null;
  let decoder = new StringDecoder('utf8');
  let buffer = '';
  let closed = false;

  /**
   * Deliver a line to a pending reader or enqueue it.
   *
   * @param line - The line to deliver.
   */
  function deliverLine(line: string): void {
    const reader = readerQueue.shift();
    if (reader) {
      reader.resolve(line);
    } else {
      lineQueue.push(line);
    }
  }

  /**
   * Handle the end of the input stream.
   */
  function deliverEOF(): void {
    while (readerQueue.length > 0) {
      const reader = readerQueue.shift();
      reader?.resolve(null);
    }
  }

  /**
   * Handle incoming data by splitting on newlines.
   *
   * @param data - The raw data buffer from the socket.
   */
  function handleData(data: Buffer): void {
    buffer += decoder.write(data);
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      deliverLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }

  /**
   * Handle the channel disconnecting.
   *
   * @param socket - The socket that disconnected.
   */
  function handleDisconnect(socket: net.Socket): void {
    if (currentSocket !== socket) {
      return;
    }
    // Flush any incomplete multi-byte sequence from the decoder
    buffer += decoder.end();
    // Deliver any remaining buffered data as a final line
    if (buffer.length > 0) {
      deliverLine(buffer);
      buffer = '';
    }
    currentSocket = null;
    deliverEOF();
  }

  const server = net.createServer((socket) => {
    if (currentSocket) {
      // Only one connection at a time
      socket.destroy();
      return;
    }
    // Drain stale state from any previous connection
    lineQueue.length = 0;
    deliverEOF();

    currentSocket = socket;
    decoder = new StringDecoder('utf8');
    buffer = '';

    socket.on('data', handleData);
    socket.on('end', () => handleDisconnect(socket));
    socket.on('error', () => handleDisconnect(socket));
    socket.on('close', () => handleDisconnect(socket));
  });

  // Remove stale socket file if it exists
  try {
    await fs.unlink(socketPath);
  } catch {
    // Ignore if it doesn't exist
  }

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const channel: IOChannel = {
    async read(): Promise<string | null> {
      if (closed) {
        return null;
      }
      const queued = lineQueue.shift();
      if (queued !== undefined) {
        return queued;
      }
      // Block until data arrives (from a current or future client connection)
      return new Promise<string | null>((resolve) => {
        readerQueue.push({ resolve });
      });
    },

    async write(data: string): Promise<void> {
      if (closed) {
        throw new Error(`IO channel "${name}" is closed`);
      }
      if (!currentSocket) {
        throw new Error(`IO channel "${name}" has no connected client`);
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

    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      deliverEOF();
      if (currentSocket) {
        currentSocket.destroy();
        currentSocket = null;
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      // Clean up socket file
      try {
        await fs.unlink(socketPath);
      } catch {
        // Ignore
      }
    },
  };

  return channel;
}
