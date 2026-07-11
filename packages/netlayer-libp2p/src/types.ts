import type { Logger } from '@metamask/logger';

/**
 * A direct (non-relay) libp2p transport implementation bundled with the listen
 * addresses it serves. Built by the `./nodejs` factory from a config's
 * `directListenAddresses`; never crosses a `Json` boundary.
 */
export type DirectTransport = {
  transport: unknown;
  listenAddresses: string[];
};

/**
 * Options for creating a {@link ConnectionFactory} instance.
 */
export type ConnectionFactoryOptions = {
  keySeed: string;
  knownRelays: string[];
  logger: Logger;
  signal: AbortSignal;
  maxRetryAttempts?: number | undefined;
  /**
   * Maximum inbound message payload size in bytes. Used as `maxDataLength`
   * on every `lpStream` constructed for a channel — must match the
   * sender-side validator's limit (`maxMessageSizeBytes` on the netlayer
   * config) so that a deployment which raises one also raises the other.
   * Defaults to `DEFAULT_MAX_MESSAGE_SIZE_BYTES` (1 MB).
   */
  maxMessageSizeBytes?: number | undefined;
  directTransports?: DirectTransport[] | undefined;
  allowedWsHosts?: string[] | undefined;
};
