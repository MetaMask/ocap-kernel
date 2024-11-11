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

import {
  VatMethodStructs,
  VatTestCommandMethod,
  VatTestMethodStructs,
  VatTestReplyStructs,
} from './vat.js';
import { VatIdStruct } from '../types.js';

export const KernelCommandMethod = {
  evaluate: VatTestCommandMethod.evaluate,
  capTpCall: 'capTpCall',
  kvSet: 'kvSet',
  kvGet: 'kvGet',
  ping: VatTestCommandMethod.ping,
} as const;

const CapTpPayloadStruct = object({
  method: string(),
  params: array(UnsafeJsonStruct),
});

export type CapTpPayload = Infer<typeof CapTpPayloadStruct>;

const KernelCommandStruct = union([
  object({
    method: literal(KernelCommandMethod.capTpCall),
    params: CapTpPayloadStruct,
  }),
  object({
    method: literal(KernelCommandMethod.kvSet),
    params: object({ key: string(), value: string() }),
  }),
  object({
    method: literal(KernelCommandMethod.kvGet),
    params: string(),
  }),
  VatTestMethodStructs.evaluate,
  VatTestMethodStructs.ping,
]);

const KernelCommandReplyStruct = union([
  object({
    method: literal(KernelCommandMethod.capTpCall),
    params: string(),
  }),
  object({
    method: literal(KernelCommandMethod.kvSet),
    params: string(),
  }),
  object({
    method: literal(KernelCommandMethod.kvGet),
    params: string(),
  }),
  VatTestReplyStructs.evaluate,
  VatTestReplyStructs.ping,
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
  payload: union([
    VatMethodStructs.evaluate,
    VatMethodStructs.ping,
    VatMethodStructs.capTpInit,
  ]),
});
