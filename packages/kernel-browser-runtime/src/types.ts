import type { Kernel, ClusterConfig } from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, Json>;

/**
 * Wrapper for a kernel reference (kref) to enable CapTP marshalling.
 *
 * When kernel returns krefs, they are wrapped in this object so CapTP's
 * custom import/export tables can convert them to presences on the background side.
 */
export type KrefWrapper = { kref: string };

/**
 * Result of launching a subcluster.
 *
 * The rootKref field contains the bootstrap vat's root object, wrapped
 * as a KrefWrapper that CapTP will marshal to a presence. The rootKrefString
 * contains the plain kref string for storage purposes.
 */
export type LaunchResult = {
  subclusterId: string;
  rootKref?: KrefWrapper;
  rootKrefString?: string;
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
  getVatRoot: (krefString: string) => Promise<KrefWrapper>;
};
