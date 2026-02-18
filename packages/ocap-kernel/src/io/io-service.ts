import { makeDefaultExo } from '@metamask/kernel-utils/exo';

import type { IOChannel } from './types.ts';
import type { IOConfig } from '../types.ts';

/**
 * Create a kernel service exo that wraps an IOChannel.
 *
 * @param name - The scoped service name (e.g. `io:s1:repl`).
 * @param channel - The underlying IOChannel to delegate to.
 * @param config - The IO configuration for this channel.
 * @returns A remotable service object with `read()` and `write()` methods.
 */
export function makeIOService(
  name: string,
  channel: IOChannel,
  config: IOConfig,
): object {
  const direction = config.direction ?? 'inout';

  return makeDefaultExo(name, {
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
