// Kernel commands.

export {
  KernelCommandMethod,
  isKernelCommand,
  isKernelCommandReply,
} from './kernel.ts';
export type { KernelCommand, KernelCommandReply } from './kernel.ts';

// Vat commands.

export {
  VatCommandMethod,
  isVatCommand,
  isVatCommandReply,
  isVatCommandPayloadUI,
} from './vat.ts';
export type {
  VatCommand,
  VatCommandReply,
  VatCommandReturnType,
} from './vat.ts';
