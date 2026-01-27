import type { ByteStream } from 'it-byte-stream';

export type InboundConnectionHandler = (channel: Channel) => void;

export type Channel = {
  msgStream: ByteStream;
  peerId: string;
};

export type RemoteMessageHandler = (
  from: string,
  message: string,
) => Promise<string>;

export type SendRemoteMessage = (to: string, message: string) => Promise<void>;

export type StopRemoteComms = () => Promise<void>;

export type RemoteComms = {
  getPeerId: () => string;
  sendRemoteMessage: SendRemoteMessage;
  issueOcapURL: (kref: string) => Promise<string>;
  redeemLocalOcapURL: (ocapURL: string) => Promise<string>;
  registerLocationHints: (peerId: string, hints: string[]) => Promise<void>;
};

export type OnRemoteGiveUp = (peerId: string) => void;

/**
 * Options for initializing remote communications.
 */
export type RemoteCommsOptions = {
  /**
   * Array of relay peer IDs/multiaddrs to use for remote communications.
   */
  relays?: string[] | undefined;
  /**
   * Maximum number of reconnection attempts. 0 = infinite (default).
   * If not provided, uses DEFAULT_MAX_RETRY_ATTEMPTS.
   */
  maxRetryAttempts?: number | undefined;
  /**
   * Maximum number of pending messages awaiting ACK per peer.
   * New messages are rejected when this limit is reached.
   * If not provided, uses DEFAULT_MAX_QUEUE (200).
   */
  maxQueue?: number | undefined;
  /**
   * Maximum number of concurrent connections (default: 100).
   * When the limit is reached, new outbound connections are rejected with
   * ResourceLimitError and inbound connections are closed immediately.
   */
  maxConcurrentConnections?: number | undefined;
  /**
   * Maximum message size in bytes (default: 1MB).
   * Messages exceeding this limit are immediately rejected with ResourceLimitError
   * before any connection or queuing attempt.
   */
  maxMessageSizeBytes?: number | undefined;
  /**
   * Interval in milliseconds between stale peer cleanup runs (default: 15 minutes).
   * Controls how often the system checks for and removes stale peer data.
   */
  cleanupIntervalMs?: number | undefined;
  /**
   * Time in milliseconds before a disconnected peer is considered stale (default: 1 hour).
   * When a peer has been disconnected for longer than this duration and is not
   * actively reconnecting, its data is cleaned up including: message queues,
   * location hints, connection timestamps, and reconnection state.
   */
  stalePeerTimeoutMs?: number | undefined;
  /**
   * BIP39 mnemonic phrase (12 or 24 words) for seed recovery.
   * When provided, derives the kernel identity seed from this mnemonic instead of
   * generating a random seed. The same mnemonic will always produce the same peer ID.
   * If the kernel already has a stored identity, the mnemonic is ignored.
   */
  mnemonic?: string | undefined;
};

export type RemoteInfo = {
  peerId: string;
  hints?: string[];
};
