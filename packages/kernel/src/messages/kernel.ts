import { object, union, is } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
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

// Explicitly annotated due to a TS2742 error that occurs during CommonJS
// builds by ts-bridge.
const KernelCommandStruct = union([VatTestMethodStructs.ping]) as Struct<
  {
    method: 'ping';
    params: Json[];
  },
  null
>;

// Explicitly annotated due to a TS2742 error that occurs during CommonJS
// builds by ts-bridge.
const KernelCommandReplyStruct = union([VatTestReplyStructs.ping]) as Struct<
  {
    method: 'ping';
    params: string;
  },
  null
>;

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
