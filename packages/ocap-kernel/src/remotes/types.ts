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
   * Maximum messages per second per peer (default: 100).
   * Messages exceeding this rate are rejected with ResourceLimitError.
   * Uses a sliding 1-second window.
   */
  maxMessagesPerSecond?: number | undefined;
  /**
   * Maximum connection attempts per minute per peer (default: 10).
   * Connection attempts exceeding this rate are rejected with ResourceLimitError.
   * Uses a sliding 1-minute window.
   */
  maxConnectionAttemptsPerMinute?: number | undefined;
};

export type RemoteInfo = {
  peerId: string;
  hints?: string[];
};
