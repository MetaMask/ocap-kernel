import type { IOConfig } from '../types.ts';

/**
 * A platform-agnostic IO channel that supports reading and writing data.
 * Implementations are platform-specific (e.g., Unix domain sockets in Node.js).
 *
 * A channel represents a *single* connection: one bidirectional stream of
 * data with one peer. Serving several peers concurrently means holding
 * several channels, one per peer, obtained from an `IOListener`.
 */
export type IOChannel = {
  /** Read the next unit of data, or `null` on EOF/disconnect. */
  read(): Promise<string | null>;
  /** Write a unit of data to the channel. */
  write(data: string): Promise<void>;
  /** Close the channel and release resources. */
  close(): Promise<void>;
};

/**
 * A platform-agnostic endpoint that peers connect to, yielding one
 * `IOChannel` per connection.
 *
 * This is the BSD listen/accept split: the listener is the stable,
 * configured point of contact (one socket path, one entry in a cluster
 * config's `io` map), while each accepted connection is a separate object
 * with its own state. Sessions are isolated because they are distinct
 * objects, so a holder of one connection has no way to reach another.
 */
export type IOListener = {
  /**
   * Wait for the next peer to connect and return a channel for it.
   *
   * Resolves to `null` once the listener has been closed, so an accept
   * loop can terminate rather than hang.
   */
  accept(): Promise<IOChannel | null>;
  /**
   * Stop listening and close every connection accepted from this
   * listener.
   */
  close(): Promise<void>;
};

/**
 * Factory function that creates an IOListener for a given configuration.
 * Injected from the host environment (e.g., Node.js) into the kernel.
 *
 * @param name - The name of the IO listener (from the cluster config key).
 * @param config - The IO configuration describing the listener type and options.
 * @returns A promise for the created IOListener.
 */
export type IOListenerFactory = (
  name: string,
  config: IOConfig,
) => Promise<IOListener>;
