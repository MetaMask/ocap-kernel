import type { IOListenerFactory, IOConfig } from '@metamask/ocap-kernel';

import { makeSocketIOListener } from './socket-listener.ts';

export { makeSocketIOListener } from './socket-listener.ts';

/**
 * Create an IOListenerFactory for the Node.js environment.
 * Dispatches on `config.type` to the appropriate listener implementation.
 *
 * @returns An IOListenerFactory.
 */
export function makeIOListenerFactory(): IOListenerFactory {
  return async (name: string, config: IOConfig) => {
    switch (config.type) {
      case 'socket':
        return makeSocketIOListener(name, config.path);
      default:
        throw new Error(
          `Unsupported IO listener type "${config.type}" for listener "${name}"`,
        );
    }
  };
}
