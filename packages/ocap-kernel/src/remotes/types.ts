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
   * Maximum number of messages to queue per peer while reconnecting.
   * If not provided, uses the default MAX_QUEUE value.
   */
  maxQueue?: number | undefined;
};

export type RemoteInfo = {
  peerId: string;
  hints?: string[];
};
