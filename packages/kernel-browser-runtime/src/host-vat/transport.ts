import type { VatSyscallObject } from '@agoric/swingset-liveslots';
import type { DeliveryObject } from '@metamask/ocap-kernel';

/**
 * Messages sent from kernel (Worker) to supervisor (background).
 */
export type KernelToSupervisorMessage =
  | { type: 'delivery'; delivery: DeliveryObject; id: string }
  | { type: 'connected' };

/**
 * Messages sent from supervisor (background) to kernel (Worker).
 */
export type SupervisorToKernelMessage =
  | { type: 'syscall'; syscall: VatSyscallObject }
  | { type: 'delivery-result'; id: string; error: string | null }
  | { type: 'ready' };
