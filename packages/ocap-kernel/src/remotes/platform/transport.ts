import type { Netlayer } from '@metamask/netlayer';
import { makeLibp2pNetlayer } from '@metamask/netlayer-libp2p';

import type {
  RemoteMessageHandler,
  OnRemoteGiveUp,
  OnIncarnationChange,
  RemoteCommsOptions,
} from '../types.ts';

/**
 * Initialize the remote comm system with information that must be provided by
 * the kernel.
 *
 * Temporary compatibility shim (netlayer Phase 4a): adapts the historical
 * positional `initTransport` signature onto the libp2p netlayer factory now
 * hosted in `@metamask/netlayer-libp2p`, so existing callers keep compiling
 * unchanged until the runtime-injection flip (Phase 4b) removes this export.
 *
 * It delegates to `makeLibp2pNetlayer` (the browser barrel entry) rather than
 * the `./nodejs` factory so that importing this module never drags the Node-
 * only QUIC/TCP transports into the extension's bundle graph. Direct transports
 * keep flowing exactly as before: `NodejsPlatformServices` still builds them and
 * forwards them here via `options.directTransports`.
 *
 * @param keySeed - Seed value for key generation, in the form of a hex-encoded string.
 * @param options - Options for remote communications initialization.
 * @param remoteMessageHandler - Handler to be called when messages are received from elsewhere.
 * @param onRemoteGiveUp - Optional callback to be called when we give up on a remote.
 * @param localIncarnationId - This kernel's incarnation ID for handshake protocol.
 * @param onIncarnationChange - Optional callback when a remote peer's incarnation changes (peer restarted).
 * @returns a {@link Netlayer}.
 */
export async function initTransport(
  keySeed: string,
  options: RemoteCommsOptions,
  remoteMessageHandler: RemoteMessageHandler,
  onRemoteGiveUp?: OnRemoteGiveUp,
  localIncarnationId?: string,
  onIncarnationChange?: OnIncarnationChange,
): Promise<Netlayer> {
  // `mnemonic`, `maxQueue`, `ackTimeoutMs`, `maxUrlRelayHints`, and
  // `maxKnownRelays` are kernel-level options that never reach the netlayer;
  // they are destructured out so only per-netlayer config lands in `rest`.
  const {
    relays,
    mnemonic: _mnemonic,
    maxQueue: _maxQueue,
    ackTimeoutMs: _ackTimeoutMs,
    maxUrlRelayHints: _maxUrlRelayHints,
    maxKnownRelays: _maxKnownRelays,
    directTransports,
    ...rest
  } = options;

  return makeLibp2pNetlayer({
    keySeed,
    incarnationId: localIncarnationId,
    hooks: {
      handleMessage: remoteMessageHandler,
      onRemoteGiveUp,
      onIncarnationChange,
    },
    config: { ...rest, knownRelays: relays },
    directTransports,
  });
}
