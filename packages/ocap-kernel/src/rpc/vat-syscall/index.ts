import type {
  MethodSpecRecord,
  HandlerRecord,
} from '@metamask/kernel-rpc-methods';

import { vatSyscallSpec, vatSyscallHandler } from './vat-syscall.ts';

export const vatSyscallHandlers = {
  syscall: vatSyscallHandler,
} as HandlerRecord<typeof vatSyscallHandler>;

export const vatSyscallMethodSpecs = {
  syscall: vatSyscallSpec,
} as MethodSpecRecord<typeof vatSyscallSpec>;

type Handlers = (typeof vatSyscallHandlers)[keyof typeof vatSyscallHandlers];

export type VatSyscallMethod = Handlers['method'];
