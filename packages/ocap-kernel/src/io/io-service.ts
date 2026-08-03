import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type { IOChannel, IOListener } from './types.ts';
import { kslot } from '../liveslots/kernel-marshal.ts';
import type { KRef } from '../types.ts';
import type { IOConfig } from '../types.ts';

/**
 * Hooks the listener service uses to host each accepted connection as a
 * kernel object reachable only by reference.
 */
export type ConnectionHost = {
  /** Host `connection` and return its kref. */
  register: (connection: object, label: string) => KRef;
  /** Release a previously hosted connection. */
  release: (kref: KRef) => void;
};

/**
 * Create a kernel service exo wrapping an `IOChannel` for one accepted
 * connection.
 *
 * `direction` is enforced here rather than on the listener, since it is a
 * property of the data flow rather than of the point of contact.
 *
 * @param name - The scoped connection name, used as the exo's interface
 * name (e.g. `io:s1:repl:c3`).
 * @param channel - The channel for this connection.
 * @param config - The IO configuration for the owning listener.
 * @param onClose - Invoked after the channel closes, so the host can stop
 * hosting this connection.
 * @returns A remotable with `read()`, `write()`, and `close()`.
 */
export function makeIOConnectionService(
  name: string,
  channel: IOChannel,
  config: IOConfig,
  onClose: () => void,
): object {
  const direction = config.direction ?? 'inout';
  let closed = false;

  return makeDefaultExo(name, {
    async read(): Promise<string | null> {
      if (direction === 'out') {
        throw new Error(`IO connection "${name}" is write-only`);
      }
      return channel.read();
    },

    async write(data: string): Promise<void> {
      if (direction === 'in') {
        throw new Error(`IO connection "${name}" is read-only`);
      }
      return channel.write(data);
    },

    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await channel.close();
      } finally {
        onClose();
      }
    },
  });
}
harden(makeIOConnectionService);

/**
 * Create a kernel service exo that wraps an `IOListener`.
 *
 * `accept()` waits for the next peer, wraps that connection in its own exo,
 * hosts it as an anonymous kernel object, and returns a `kslot` standin so
 * the calling vat receives it as an ordinary Presence. Each connection is
 * therefore a distinct object with its own state, and holding one conveys
 * no access to any other.
 *
 * @param name - The scoped service name (e.g. `io:s1:repl`).
 * @param listener - The underlying listener to delegate to.
 * @param config - The IO configuration for this listener.
 * @param host - Hooks for hosting accepted connections as kernel objects.
 * @returns A remotable service object with `accept()` and `close()`.
 */
export function makeIOListenerService(
  name: string,
  listener: IOListener,
  config: IOConfig,
  host: ConnectionHost,
): object {
  let nextConnectionId = 0;

  return makeDefaultExo(name, {
    async accept(): Promise<unknown> {
      const channel = await listener.accept();
      if (!channel) {
        // Listener closed; report EOF rather than leaving the caller's
        // accept loop hanging forever.
        return null;
      }
      nextConnectionId += 1;
      const connectionName = `${name}:c${nextConnectionId}`;
      // Hosting needs the connection object, but the connection's close
      // handler needs the resulting kref, so the kref is shared through a
      // holder that is filled in immediately after registration.
      const hosted: { kref?: KRef } = {};
      const connection = makeIOConnectionService(
        connectionName,
        channel,
        config,
        () => {
          if (hosted.kref) {
            host.release(hosted.kref);
          }
        },
      );
      hosted.kref = host.register(connection, connectionName);
      return kslot(hosted.kref, connectionName);
    },

    async close(): Promise<void> {
      return listener.close();
    },
  });
}
harden(makeIOListenerService);
