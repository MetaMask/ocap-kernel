import type { NetlayerSpecifier, SendRemoteMessage } from '@metamask/netlayer';

import type { KRef } from '../types.ts';

// Netlayer contract types are defined in `@metamask/netlayer` and re-exported
// here so kernel consumers and runtimes keep importing them from ocap-kernel.
export type {
  NetworkChannel,
  ChannelProvider,
  InboundChannelHandler,
  PeerDisconnectHandler,
  RemoteMessageHandler,
  SendRemoteMessage,
  StopRemoteComms,
  OnRemoteGiveUp,
  OnIncarnationChange,
  Netlayer,
  NetlayerHooks,
  NetlayerFactory,
  NetlayerParams,
  NetlayerSpecifier,
  NetlayerRegistry,
} from '@metamask/netlayer';

export type RemoteIdentity = {
  getPeerId: () => string;
  issueOcapURL: (kref: KRef) => Promise<string>;
  redeemLocalOcapURL: (ocapURL: string) => Promise<KRef>;
  addKnownLocationHints: (hints: string[]) => void;
};

export type RemoteComms = RemoteIdentity & {
  sendRemoteMessage: SendRemoteMessage;
  registerLocationHints: (peerId: string, hints: string[]) => Promise<void>;
};

/**
 * Kernel-level options for initializing remote communications. All per-netlayer
 * configuration lives in `specifier.config`; only options the kernel itself
 * owns remain here.
 */
export type RemoteCommsOptions = {
  /**
   * Which netlayer to use and its `Json` config. By convention the kernel knows
   * exactly one config key — `knownRelays: string[]` — which it treats as the
   * opaque hint pool it persists and re-injects. Omitted specifiers default to
   * the libp2p netlayer during the transition.
   */
  specifier?: NetlayerSpecifier | undefined;
  /**
   * BIP39 mnemonic phrase for seed recovery. Sensitive key material; never
   * forwarded to the netlayer.
   */
  mnemonic?: string | undefined;
  /**
   * Maximum number of pending messages awaiting ACK per peer (default: 200).
   */
  maxQueue?: number | undefined;
  /**
   * Timeout in milliseconds for ACK before retransmitting a message.
   */
  ackTimeoutMs?: number | undefined;
  /**
   * Maximum number of location hints embedded in a single OCAP URL (default: 3).
   */
  maxUrlLocationHints?: number | undefined;
  /**
   * Maximum number of location-hint entries stored in the kernel's hint pool
   * (default: 20).
   */
  maxKnownLocationHints?: number | undefined;
};

export type RemoteInfo = {
  peerId: string;
  hints?: string[];
};
