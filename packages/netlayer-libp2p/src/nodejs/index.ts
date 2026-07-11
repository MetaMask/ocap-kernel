import type { NetlayerFactory } from '@metamask/netlayer';
import { assert } from '@metamask/superstruct';

import { Libp2pNetlayerConfigStruct } from '../config.ts';
import type { Libp2pNetlayerConfig } from '../config.ts';
import { makeLibp2pNetlayer } from '../make-libp2p-netlayer.ts';
import { buildDirectTransports } from './direct-transports.ts';

/**
 * The Node.js libp2p netlayer factory. Validates the config at the boundary,
 * builds any direct (QUIC/TCP) transports from `config.directListenAddresses`,
 * and constructs a libp2p netlayer. Owns direct-transport injection so callers
 * never import transport packages.
 *
 * @param params - The netlayer params.
 * @param params.keySeed - Hex-encoded key seed the peer id is derived from.
 * @param params.incarnationId - This kernel's incarnation id.
 * @param params.hooks - Kernel-supplied callbacks.
 * @param params.config - The libp2p netlayer config (validated here).
 * @param params.logger - Optional logger.
 * @returns The libp2p netlayer with direct transports.
 */
export const nodejsLibp2pNetlayerFactory: NetlayerFactory<Libp2pNetlayerConfig> =
  async function nodejsLibp2pNetlayerFactory({
    keySeed,
    incarnationId,
    hooks,
    config,
    logger,
  }) {
    assert(config, Libp2pNetlayerConfigStruct);
    const directTransports = buildDirectTransports(
      config.directListenAddresses ?? [],
    );
    return makeLibp2pNetlayer({
      keySeed,
      incarnationId,
      hooks,
      config,
      logger,
      directTransports,
    });
  };
harden(nodejsLibp2pNetlayerFactory);

export { buildDirectTransports } from './direct-transports.ts';
