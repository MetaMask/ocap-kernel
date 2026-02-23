import type { IOConfig } from '../types.ts';

/**
 * A platform-agnostic IO channel that supports reading and writing data.
 * Implementations are platform-specific (e.g., Unix domain sockets in Node.js).
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
 * Factory function that creates an IOChannel for a given configuration.
 * Injected from the host environment (e.g., Node.js) into the kernel.
 *
 * @param name - The name of the IO channel (from the cluster config key).
 * @param config - The IO configuration describing the channel type and options.
 * @returns A promise for the created IOChannel.
 */
export type IOChannelFactory = (
  name: string,
  config: IOConfig,
) => Promise<IOChannel>;
