import { vatSyscallSpec, vatSyscallHandler } from './vat-syscall.ts';

export const vatSyscallHandlers = {
  syscall: vatSyscallHandler,
} as const;

export const vatSyscallMethodSpecs = {
  syscall: vatSyscallSpec,
} as const;

type Handlers = (typeof vatSyscallHandlers)[keyof typeof vatSyscallHandlers];

export type VatSyscallMethod = Handlers['method'];
