import type {
  Channel,
  Decision,
  SectionNotification,
} from '@metamask/kernel-utils/session';
import { NodeSocketDuplexStream } from '@metamask/streams';
import { unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';

import { readLine, writeLine } from './socket-line.ts';

/**
 * Handle returned by {@link startStreamSocketServer}.
 */
export type StreamSocketServerHandle = {
  close: () => Promise<void>;
};

/**
 * Start a Unix socket server that accepts persistent TUI subscriber connections.
 *
 * Each connection performs a one-line handshake carrying the OCAP URL that
 * identifies the target channel, then upgrades to a
 * {@link NodeSocketDuplexStream}<{@link SectionNotification}, {@link Decision}>
 * and calls `channel.subscribe(stream)`.
 *
 * Multiple concurrent connections are supported; each is routed to the correct
 * channel independently, so broadcasts from different sessions do not interfere.
 *
 * @param options - Server options.
 * @param options.socketPath - The Unix socket path to listen on.
 * @param options.getChannelByUrl - Resolves an OCAP URL to the corresponding channel.
 * @returns A handle with a `close()` function for cleanup.
 */
export async function startStreamSocketServer({
  socketPath,
  getChannelByUrl,
}: {
  socketPath: string;
  getChannelByUrl: (url: string) => Channel | undefined;
}): Promise<StreamSocketServerHandle> {
  const server: Server = createServer((socket) => {
    (async () => {
      try {
        // Phase 1: read the one-line JSON handshake to identify the channel.
        const handshakeLine = await readLine(socket, 10_000);
        const handshake = JSON.parse(handshakeLine) as { ocapUrl?: unknown };
        const { ocapUrl } = handshake;
        if (typeof ocapUrl !== 'string') {
          socket.destroy(new Error('Stream handshake missing ocapUrl'));
          return;
        }

        const channel = getChannelByUrl(ocapUrl);
        if (channel === undefined) {
          socket.destroy(new Error(`No channel for URL: ${ocapUrl}`));
          return;
        }

        // Phase 2: ACK the handshake so the client knows readLine is done,
        // then upgrade to a typed duplex stream and subscribe.
        await writeLine(socket, 'ok');
        const stream = await NodeSocketDuplexStream.make<
          Decision,
          SectionNotification
        >(socket);
        channel.subscribe(stream);
      } catch {
        socket.destroy();
      }
    })().catch(() => undefined);
  });

  await listen(server, socketPath);

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      await unlink(socketPath).catch(() => undefined);
    },
  };
}

/**
 * Start listening on a Unix socket path, removing a stale socket file first.
 *
 * @param server - The net.Server instance.
 * @param socketPath - The Unix socket path.
 */
async function listen(server: Server, socketPath: string): Promise<void> {
  try {
    await unlink(socketPath);
  } catch {
    // Ignore — file may not exist.
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}
