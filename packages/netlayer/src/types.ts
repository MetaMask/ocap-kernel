import type { Logger } from '@metamask/logger';
import type { Json } from '@metamask/utils';

/**
 * A transport-neutral bidirectional message channel to a single remote peer.
 * Byte-oriented: `read` yields one complete inbound message payload per call,
 * `write` sends one complete outbound message payload. Framing, encryption,
 * and transport-error mapping are the ChannelProvider's responsibility.
 */
export type NetworkChannel = {
  /** The remote peer's id (opaque string; libp2p peerId today). */
  readonly peerId: string;
  /**
   * Read the next complete inbound message payload.
   * Throws a neutral kernel-error on failure:
   * - `MessageTooLargeError` when the peer announced an oversize frame,
   * - `ChannelResetError` on a remote-initiated reset,
   * - `IntentionalDisconnectError` on a locally/remotely intended close,
   * - any other error is re-thrown as-is (engine treats it as connection loss).
   */
  read: () => Promise<Uint8Array>;
  /** Write one complete outbound message payload. Throws if the channel is not writable. */
  write: (data: Uint8Array) => Promise<void>;
  /** Close the channel, releasing transport resources. Idempotent. */
  close: () => Promise<void>;
  /**
   * Set the bidirectional inactivity timeout in ms. May be a no-op for
   * transports without the concept. Called once after the channel is registered.
   */
  setInactivityTimeout: (ms: number) => void;
};

export type InboundChannelHandler = (
  channel: NetworkChannel,
) => Promise<void> | void;

export type PeerDisconnectHandler = (peerId: string) => void;

/**
 * A channel-based transport implementation consumed by `makeChannelNetlayer`.
 * The libp2p `ConnectionFactory` is the first implementation; the loopback
 * netlayer does not use this seam.
 */
export type ChannelProvider = {
  /** The neutral peer id this provider authenticates as. */
  readonly peerId: string;
  /**
   * Dial a peer, returning a live channel. Deduplicates concurrent dials to
   * the same peer internally (idempotent).
   *
   * @param peerId - The peer to dial.
   * @param hints - Location hints (opaque transport-specific strings).
   * @param withRetry - When true, apply the provider's connect backoff/retry.
   */
  dial: (
    peerId: string,
    hints: string[],
    withRetry: boolean,
  ) => Promise<NetworkChannel>;
  onInboundChannel: (handler: InboundChannelHandler) => void;
  onPeerDisconnect: (handler: PeerDisconnectHandler) => void;
  closeChannel: (channel: NetworkChannel) => Promise<void>;
  getListenAddresses: () => string[];
  stop: () => Promise<void>;
};

export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string | null>;

export type SendRemoteMessage = (to: string, message: string) => Promise<void>;

export type StopRemoteComms = () => Promise<void>;

export type OnRemoteGiveUp = (peerId: string) => void;

/**
 * Callback invoked after every successful handshake with a remote peer,
 * carrying the incarnationId the peer just reported.
 *
 * Fires unconditionally (not only on detected change) so the kernel layer can
 * compare the observed value against persisted state and detect a peer
 * restart even when the in-memory PeerStateManager has been rebuilt empty
 * (e.g. after a receiver restart or stale-peer cleanup).
 *
 * Resolves `true` if the kernel detected an actual restart (and reset its
 * RemoteHandle state). The transport awaits this and uses the verdict to
 * suppress stale outbound messages on the same connection — the in-memory
 * PSM check is unreliable across receiver-side state loss.
 *
 * @param peerId - The peer ID that completed the handshake.
 * @param observedIncarnation - The incarnationId the peer reported.
 * @returns Whether the peer was determined to have restarted.
 */
export type OnIncarnationChange = (
  peerId: string,
  observedIncarnation: string,
) => Promise<boolean>;

/**
 * The kernel-facing netlayer contract. Peers and messages are opaque strings;
 * a netlayer moves best-effort ordered bytes between kernels and may drop them
 * on reconnect (the Ken protocol above it handles reliability).
 */
export type Netlayer = {
  /** This netlayer's neutral peer id. */
  readonly peerId: string;
  sendRemoteMessage: SendRemoteMessage;
  closeConnection: (peerId: string) => Promise<void>;
  registerLocationHints: (peerId: string, hints: string[]) => void;
  /** Reconnect to a peer. May be a no-op for transports without reconnection. */
  reconnectPeer: (peerId: string, hints?: string[]) => Promise<void>;
  /** Reset all reconnection backoffs. May be a no-op. */
  resetAllBackoffs: () => void;
  /** Netlayer-specific listen-address hint strings, if any. */
  getListenAddresses: () => string[];
  stop: StopRemoteComms;
};

/**
 * Kernel-supplied callbacks a netlayer invokes.
 */
export type NetlayerHooks = {
  handleMessage: RemoteMessageHandler;
  onRemoteGiveUp?: OnRemoteGiveUp | undefined;
  onIncarnationChange?: OnIncarnationChange | undefined;
};

/**
 * Parameters passed to a {@link NetlayerFactory} to build a {@link Netlayer}.
 */
export type NetlayerParams<Config = Json> = {
  /** Hex-encoded key seed; the netlayer MUST authenticate as the derived Ed25519 key. */
  keySeed: string;
  incarnationId?: string | undefined;
  hooks: NetlayerHooks;
  /** Netlayer-specific config, superstruct-validated by the implementation. */
  config: Config;
  logger?: Logger | undefined;
};

export type NetlayerFactory<Config = Json> = (
  params: NetlayerParams<Config>,
) => Promise<Netlayer>;

/** A serializable pointer to a netlayer + its config. `Json` so it crosses postMessage. */
export type NetlayerSpecifier = { netlayer: string; config: Json };

export type NetlayerRegistry = Record<string, NetlayerFactory>;

/**
 * Engine-level tuning options for the channel netlayer. These are the subset of
 * the kernel's remote-comms options the transport engine consumes;
 * provider-specific options (relays, direct transports, allowed ws hosts) are
 * handled separately by the provider.
 */
export type ChannelNetlayerOptions = {
  maxRetryAttempts?: number | undefined;
  maxConcurrentConnections?: number | undefined;
  maxMessageSizeBytes?: number | undefined;
  cleanupIntervalMs?: number | undefined;
  stalePeerTimeoutMs?: number | undefined;
  maxMessagesPerSecond?: number | undefined;
  maxConnectionAttemptsPerMinute?: number | undefined;
  reconnectionBaseDelayMs?: number | undefined;
  reconnectionMaxDelayMs?: number | undefined;
  handshakeTimeoutMs?: number | undefined;
  writeTimeoutMs?: number | undefined;
  streamInactivityTimeoutMs?: number | undefined;
  localIncarnationId?: string | undefined;
};
