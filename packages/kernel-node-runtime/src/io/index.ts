import type { IOChannelFactory, IOConfig } from '@metamask/ocap-kernel';

import { makeSocketIOChannel } from './socket-channel.ts';

export { makeSocketIOChannel } from './socket-channel.ts';

/**
 * Create an IOChannelFactory for the Node.js environment.
 * Dispatches on `config.type` to the appropriate channel implementation.
 *
 * @returns An IOChannelFactory.
 */
export function makeIOChannelFactory(): IOChannelFactory {
  return async (name: string, config: IOConfig) => {
    switch (config.type) {
      case 'socket':
        return makeSocketIOChannel(name, config.path);
      default:
        throw new Error(
          `Unsupported IO channel type "${config.type}" for channel "${name}"`,
        );
    }
  };
}
