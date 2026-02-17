import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type { IOChannel } from './types.ts';
import type { IOConfig } from '../types.ts';

/**
 * Create a kernel service exo that wraps an IOChannel.
 *
 * @param name - The name of the IO channel.
 * @param subclusterId - The subcluster ID of the subcluster this IOChannel is being created for.
 * @param channel - The underlying IOChannel to delegate to.
 * @param config - The IO configuration for this channel.
 * @returns A remotable service object with `read()` and `write()` methods.
 */
export function makeIOService(
  name: string,
  subclusterId: string,
  channel: IOChannel,
  config: IOConfig,
): object {
  const direction = config.direction ?? 'inout';

  return makeDefaultExo(`io:${subclusterId}:${name}`, {
    async read(): Promise<string | null> {
      if (direction === 'out') {
        throw new Error(`IO channel "${name}" is write-only`);
      }
      return channel.read();
    },

    async write(data: string): Promise<void> {
      if (direction === 'in') {
        throw new Error(`IO channel "${name}" is read-only`);
      }
      return channel.write(data);
    },
  });
}
harden(makeIOService);
