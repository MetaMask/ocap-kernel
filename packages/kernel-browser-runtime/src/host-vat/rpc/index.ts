import type {
  HandlerRecord,
  MethodSpecRecord,
} from '@metamask/kernel-rpc-methods';
import {
  vatHandlers,
  vatMethodSpecs,
  vatSyscallHandlers,
  vatSyscallMethodSpecs,
} from '@metamask/ocap-kernel/rpc';

// Extract types
type DeliverSpec = (typeof vatMethodSpecs)['deliver'];
type DeliverHandler = (typeof vatHandlers)['deliver'];
type VatSyscallSpec = (typeof vatSyscallMethodSpecs)['syscall'];
type VatSyscallHandler = (typeof vatSyscallHandlers)['syscall'];

/**
 * Method specs for messages from kernel to supervisor (requests).
 */
export const kernelToSupervisorSpecs = {
  deliver: vatMethodSpecs.deliver,
} as MethodSpecRecord<DeliverSpec>;

/**
 * Handlers for the kernel to process notifications from the supervisor.
 */
export const kernelHandlers: HandlerRecord<VatSyscallHandler> =
  vatSyscallHandlers;

/**
 * Method specs for messages from supervisor to kernel (notifications).
 */
export const supervisorToKernelSpecs: MethodSpecRecord<VatSyscallSpec> =
  vatSyscallMethodSpecs;

/**
 * Handlers for the supervisor to process requests from the kernel.
 */
export const supervisorHandlers = {
  deliver: vatHandlers.deliver,
} as HandlerRecord<DeliverHandler>;
