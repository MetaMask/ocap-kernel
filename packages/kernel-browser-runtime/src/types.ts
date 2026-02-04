import type { Kernel, ClusterConfig } from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, Json>;

/**
 * Result of launching a subcluster.
 *
 * The rootKref contains the kref string for the bootstrap vat's root object.
 */
export type LaunchResult = {
  subclusterId: string;
  rootKref: string;
};

/**
 * The kernel facade interface - methods exposed to userspace via CapTP.
 *
 * This is the remote presence type that the background receives from the kernel.
 */
export type KernelFacade = {
  ping: () => Promise<'pong'>;
  launchSubcluster: (config: ClusterConfig) => Promise<LaunchResult>;
  terminateSubcluster: Kernel['terminateSubcluster'];
  queueMessage: Kernel['queueMessage'];
  getStatus: Kernel['getStatus'];
  pingVat: Kernel['pingVat'];
  getVatRoot: (krefString: string) => Promise<unknown>;
  getSystemSubclusterRoot: (name: string) => Promise<{ kref: string }>;
  reset: Kernel['reset'];
};
