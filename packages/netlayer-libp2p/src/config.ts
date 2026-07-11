import {
  array,
  integer,
  min,
  object,
  optional,
  string,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

/**
 * Superstruct schema for the libp2p netlayer's config. Every field is
 * JSON-serializable (string/number/array) so the config survives the browser
 * `postMessage` boundary as part of a `NetlayerSpecifier`.
 *
 * These are the per-netlayer options that used to live on the kernel-level
 * `RemoteCommsOptions`; the kernel-owned options (`mnemonic`, `maxQueue`,
 * `ackTimeoutMs`, `maxUrlRelayHints`, `maxKnownRelays`) stay in ocap-kernel.
 */
export const Libp2pNetlayerConfigStruct = object({
  /** Opaque relay hint strings (the kernel's persisted hint pool). */
  knownRelays: optional(array(string())),
  maxRetryAttempts: optional(min(integer(), 0)),
  maxConcurrentConnections: optional(min(integer(), 1)),
  maxMessageSizeBytes: optional(min(integer(), 1)),
  cleanupIntervalMs: optional(min(integer(), 0)),
  stalePeerTimeoutMs: optional(min(integer(), 0)),
  maxMessagesPerSecond: optional(min(integer(), 1)),
  maxConnectionAttemptsPerMinute: optional(min(integer(), 1)),
  reconnectionBaseDelayMs: optional(min(integer(), 0)),
  reconnectionMaxDelayMs: optional(min(integer(), 0)),
  handshakeTimeoutMs: optional(min(integer(), 0)),
  writeTimeoutMs: optional(min(integer(), 0)),
  streamInactivityTimeoutMs: optional(min(integer(), 0)),
  allowedWsHosts: optional(array(string())),
  /** Direct (non-relay) listen addresses; consumed by the `./nodejs` factory. */
  directListenAddresses: optional(array(string())),
});

export type Libp2pNetlayerConfig = Infer<typeof Libp2pNetlayerConfigStruct>;
