import type { Kernel } from '@metamask/ocap-kernel';

/**
 * The kernel facade interface - methods exposed to userspace via CapTP.
 *
 * This is the remote presence type that the background receives from the kernel.
 */
export type KernelFacade = {
  launchSubcluster: Kernel['launchSubcluster'];
  terminateSubcluster: Kernel['terminateSubcluster'];
  queueMessage: Kernel['queueMessage'];
  getStatus: Kernel['getStatus'];
  pingVat: Kernel['pingVat'];
};
