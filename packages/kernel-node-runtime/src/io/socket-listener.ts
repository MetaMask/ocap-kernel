import type { IOChannel, IOListener } from '@metamask/ocap-kernel';
import fs from 'node:fs/promises';
import * as net from 'node:net';
import { StringDecoder } from 'node:string_decoder';

type PendingReader = {
  resolve: (value: string | null) => void;
};

type PendingAcceptor = {
  resolve: (value: IOChannel | null) => void;
};

/**
 * Wrap a connected socket as an `IOChannel`.
 *
 * All of the channel's state — receive buffer, decoder, queued lines, and
 * pending readers — is local to this function, so concurrent connections
 * cannot interfere with one another. This is the reason the listener can
 * serve many peers at once where a single shared channel could not.
 *
 * @param name - The connection name (for diagnostics).
 * @param socket - The connected socket.
 * @param onClosed - Invoked once when the connection is finished, whether
 * because the peer went away or because `close()` was called.
 * @returns The channel for this connection.
 */
export function makeConnectionChannel(
  name: string,
  socket: net.Socket,
  onClosed: () => void,
): IOChannel {
  const lineQueue: string[] = [];
  const readerQueue: PendingReader[] = [];
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  let ended = false;
  let closed = false;

  /**
   * Deliver a line to a pending reader or enqueue it for a future read.
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
   * Resolve every waiting reader with EOF.
   */
  function deliverEOF(): void {
    while (readerQueue.length > 0) {
      readerQueue.shift()?.resolve(null);
    }
  }

  /**
   * Split incoming bytes into `\n`-delimited lines.
   *
   * @param data - The raw data from the socket.
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
   * Handle the channel finishing, from either end. Unlike a shared channel
   * there is no ambiguity about whose session ended: this channel serves
   * exactly one peer, so the end of the socket is the end of the channel.
   *
   * A trailing partial line is flushed only when the peer ended things,
   * because that data arrived before the peer went away. When the holder
   * called `close()` it is discarded instead — EOF has already been
   * reported, and handing data over afterwards would contradict it.
   */
  function handleEnd(): void {
    if (ended) {
      return;
    }
    ended = true;
    const trailing = buffer + decoder.end();
    buffer = '';
    if (!closed && trailing.length > 0) {
      deliverLine(trailing);
    }
    deliverEOF();
    onClosed();
  }

  socket.on('data', handleData);
  socket.on('end', handleEnd);
  socket.on('error', handleEnd);
  socket.on('close', handleEnd);

  return {
    async read(): Promise<string | null> {
      const queued = lineQueue.shift();
      if (queued !== undefined) {
        return queued;
      }
      if (ended || closed) {
        return null;
      }
      return new Promise<string | null>((resolve) => {
        readerQueue.push({ resolve });
      });
    },

    async write(data: string): Promise<void> {
      if (closed || ended) {
        throw new Error(`IO connection "${name}" is closed`);
      }
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
      // Drop lines already queued: the holder is done reading, so nothing
      // buffered may surface from a later read() once EOF is reported.
      // `handleEnd` discards the trailing fragment for the same reason,
      // keyed on `closed`. Deliberately not setting `ended` here — that
      // would make `handleEnd` return early and skip `onClosed`, leaving
      // this channel registered with the listener for good.
      lineQueue.length = 0;
      deliverEOF();
      socket.destroy();
      // `close` on the socket will fire handleEnd, but call it directly so
      // the caller's `onClosed` bookkeeping is done by the time close()
      // resolves rather than a turn later.
      handleEnd();
    },
  };
}

/**
 * Create an `IOListener` backed by a Unix domain socket.
 *
 * Creates a `net.Server` on the configured path. Every connection that
 * arrives becomes its own `IOChannel`, handed out by `accept()`, so any
 * number of peers can be served concurrently. Lines are `\n`-delimited.
 *
 * Connections that arrive before anyone calls `accept()` are queued, so a
 * peer connecting during startup is not dropped.
 *
 * @param name - The listener name (for diagnostics).
 * @param socketPath - The file path for the Unix domain socket.
 * @returns A promise for the IOListener, resolved once the server is listening.
 */
export async function makeSocketIOListener(
  name: string,
  socketPath: string,
): Promise<IOListener> {
  /** Connections that have arrived but not yet been accepted. */
  const readyQueue: IOChannel[] = [];
  /** Callers waiting in `accept()` for a connection to arrive. */
  const acceptorQueue: PendingAcceptor[] = [];
  /** Live connections, so `close()` can tear them all down. */
  const liveChannels = new Set<IOChannel>();
  let closed = false;
  let nextConnectionId = 0;

  const server = net.createServer((socket) => {
    if (closed) {
      socket.destroy();
      return;
    }
    nextConnectionId += 1;
    const connectionName = `${name}:${nextConnectionId}`;
    const channel: IOChannel = makeConnectionChannel(
      connectionName,
      socket,
      () => {
        liveChannels.delete(channel);
      },
    );
    liveChannels.add(channel);

    const acceptor = acceptorQueue.shift();
    if (acceptor) {
      acceptor.resolve(channel);
    } else {
      readyQueue.push(channel);
    }
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

  return {
    async accept(): Promise<IOChannel | null> {
      const ready = readyQueue.shift();
      if (ready) {
        return ready;
      }
      if (closed) {
        return null;
      }
      return new Promise<IOChannel | null>((resolve) => {
        acceptorQueue.push({ resolve });
      });
    },

    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      // Release anyone parked in accept() so their loops can exit.
      while (acceptorQueue.length > 0) {
        acceptorQueue.shift()?.resolve(null);
      }
      readyQueue.length = 0;
      for (const channel of [...liveChannels]) {
        await channel.close();
      }
      liveChannels.clear();
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
}
