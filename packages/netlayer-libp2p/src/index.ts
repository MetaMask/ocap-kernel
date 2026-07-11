import type { NetlayerFactory } from '@metamask/netlayer';
import { assert } from '@metamask/superstruct';

import { Libp2pNetlayerConfigStruct } from './config.ts';
import type { Libp2pNetlayerConfig } from './config.ts';
import { makeLibp2pNetlayer } from './make-libp2p-netlayer.ts';

/**
 * The browser-default libp2p netlayer factory. Validates the config at the
 * boundary and constructs a libp2p {@link import('@metamask/netlayer').Netlayer}
 * over WebSocket/WebTransport/WebRTC + circuit-relay transports. For Node.js
 * direct transports (QUIC/TCP), use the `./nodejs` factory instead.
 *
 * @param params - The netlayer params.
 * @param params.keySeed - Hex-encoded key seed the peer id is derived from.
 * @param params.incarnationId - This kernel's incarnation id.
 * @param params.hooks - Kernel-supplied callbacks.
 * @param params.config - The libp2p netlayer config (validated here).
 * @param params.logger - Optional logger.
 * @returns The libp2p netlayer.
 */
export const libp2pNetlayerFactory: NetlayerFactory<Libp2pNetlayerConfig> =
  async function libp2pNetlayerFactory({
    keySeed,
    incarnationId,
    hooks,
    config,
    logger,
  }) {
    assert(config, Libp2pNetlayerConfigStruct);
    return makeLibp2pNetlayer({
      keySeed,
      incarnationId,
      hooks,
      config,
      logger,
    });
  };
harden(libp2pNetlayerFactory);

export { Libp2pNetlayerConfigStruct } from './config.ts';
export type { Libp2pNetlayerConfig } from './config.ts';
// `makeLibp2pNetlayer` is re-exported for the ocap-kernel compatibility shim,
// which must not reach the `./nodejs` subpath (browser bundling). It accepts a
// pre-built `directTransports` array that the public factory does not expose.
export { makeLibp2pNetlayer } from './make-libp2p-netlayer.ts';
export type { MakeLibp2pNetlayerParams } from './make-libp2p-netlayer.ts';
export type { DirectTransport } from './types.ts';
