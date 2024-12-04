import {
  object,
  union,
  literal,
  string,
  is,
  array,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { TypeGuard } from '@ocap/utils';

import { VatCommandMethod, VatMethodStructs, VatReplyStructs } from './vat.js';
import { VatIdStruct } from '../types.js';

export const KernelCommandMethod = {
  ping: VatCommandMethod.ping,
  kvSet: 'kvSet',
  kvGet: 'kvGet',
} as const;

export const CapTpPayloadStruct = object({
  method: string(),
  params: array(UnsafeJsonStruct),
});

export type CapTpPayload = Infer<typeof CapTpPayloadStruct>;

const KernelCommandStruct = union([
  object({
    method: literal(KernelCommandMethod.kvSet),
    params: object({ key: string(), value: string() }),
  }),
  object({
    method: literal(KernelCommandMethod.kvGet),
    params: string(),
  }),
  VatMethodStructs.ping,
]);

const KernelCommandReplyStruct = union([
  object({
    method: literal(KernelCommandMethod.kvSet),
    params: string(),
  }),
  object({
    method: literal(KernelCommandMethod.kvGet),
    params: string(),
  }),
  VatReplyStructs.ping,
]);

export type KernelCommand = Infer<typeof KernelCommandStruct>;
export type KernelCommandReply = Infer<typeof KernelCommandReplyStruct>;

export const isKernelCommand: TypeGuard<KernelCommand> = (
  value: unknown,
): value is KernelCommand => is(value, KernelCommandStruct);

export const isKernelCommandReply: TypeGuard<KernelCommandReply> = (
  value: unknown,
): value is KernelCommandReply => is(value, KernelCommandReplyStruct);

export const KernelSendMessageStruct = object({
  id: VatIdStruct,
  payload: union([VatMethodStructs.ping, VatMethodStructs.capTpInit]),
});
