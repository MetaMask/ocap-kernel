import type { Kernel } from '@metamask/ocap-kernel';
import type { Json } from '@metamask/utils';

/**
 * A CapTP message that can be sent over the wire.
 */
export type CapTPMessage = Record<string, Json>;

/**
 * The kernel facade interface - methods exposed to userspace via CapTP.
 *
 * This is the remote presence type that the background receives from the kernel.
 */
export type KernelFacade = {
  ping: () => Promise<'pong'>;
  launchSubcluster: Kernel['launchSubcluster'];
  terminateSubcluster: Kernel['terminateSubcluster'];
  queueMessage: Kernel['queueMessage'];
  getStatus: Kernel['getStatus'];
  pingVat: Kernel['pingVat'];
};
