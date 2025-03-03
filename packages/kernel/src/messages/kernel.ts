import { object, union, is } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { TypeGuard } from '@ocap/utils';

import {
  VatMethodStructs,
  VatTestCommandMethod,
  VatTestMethodStructs,
  VatTestReplyStructs,
} from './vat.ts';
import { VatIdStruct } from '../types.ts';

export const KernelCommandMethod = {
  ping: VatTestCommandMethod.ping,
} as const;

const KernelCommandStruct = union([VatTestMethodStructs.ping]);

const KernelCommandReplyStruct = union([VatTestReplyStructs.ping]);

export type KernelCommand = Infer<typeof KernelCommandStruct>;
export type KernelCommandReply = Infer<typeof KernelCommandReplyStruct>;

export const isKernelCommand: TypeGuard<KernelCommand> = (
  value: unknown,
): value is KernelCommand => is(value, KernelCommandStruct);

export const isKernelCommandReply: TypeGuard<KernelCommandReply> = (
  value: unknown,
): value is KernelCommandReply => is(value, KernelCommandReplyStruct);

export const KernelSendVatCommandStruct = object({
  id: VatIdStruct,
  payload: union([VatMethodStructs.ping]),
});
