import {
  object,
  union,
  literal,
  boolean,
  array,
  type,
  is,
  string,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';
import { VatConfigStruct, VatIdStruct } from '@ocap/kernel';
import type { TypeGuard } from '@ocap/utils';

export const KernelControlMethod = {
  launchVat: 'launchVat',
  restartVat: 'restartVat',
  terminateVat: 'terminateVat',
  terminateAllVats: 'terminateAllVats',
  getStatus: 'getStatus',
  sendMessage: 'sendMessage',
  clearState: 'clearState',
} as const;

export type KernelStatus = {
  isRunning: boolean;
  activeVats: VatId[];
};

const KernelStatusStruct = type({
  isRunning: boolean(),
  activeVats: array(VatIdStruct),
});

export const isKernelStatus: TypeGuard<KernelStatus> = (
  value,
): value is KernelStatus => is(value, KernelStatusStruct);

const KernelControlCommandStruct = union([
  object({
    method: literal(KernelControlMethod.launchVat),
    params: VatConfigStruct,
  }),
  object({
    method: literal(KernelControlMethod.restartVat),
    params: object({ id: VatIdStruct }),
  }),
  object({
    method: literal(KernelControlMethod.terminateVat),
    params: object({ id: VatIdStruct }),
  }),
  object({
    method: literal(KernelControlMethod.terminateAllVats),
    params: literal(null),
  }),
  object({
    method: literal(KernelControlMethod.clearState),
    params: literal(null),
  }),
  object({
    method: literal(KernelControlMethod.getStatus),
    params: literal(null),
  }),
  object({
    method: literal(KernelControlMethod.sendMessage),
    params: object({
      id: union([VatIdStruct, literal(undefined)]),
      payload: UnsafeJsonStruct,
    }),
  }),
]);

const KernelControlReplyStruct = union([
  object({
    method: literal(KernelControlMethod.launchVat),
    params: union([literal(null), object({ error: string() })]),
  }),
  object({
    method: literal(KernelControlMethod.restartVat),
    params: union([literal(null), object({ error: string() })]),
  }),
  object({
    method: literal(KernelControlMethod.terminateVat),
    params: union([literal(null), object({ error: string() })]),
  }),
  object({
    method: literal(KernelControlMethod.terminateAllVats),
    params: union([literal(null), object({ error: string() })]),
  }),
  object({
    method: literal(KernelControlMethod.getStatus),
    params: union([KernelStatusStruct, object({ error: string() })]),
  }),
  object({
    method: literal(KernelControlMethod.sendMessage),
    params: UnsafeJsonStruct,
  }),
  object({
    method: literal(KernelControlMethod.clearState),
    params: literal(null),
  }),
]);

export type KernelControlCommand = Infer<typeof KernelControlCommandStruct> &
  Json;
export type KernelControlReply = Infer<typeof KernelControlReplyStruct> & Json;

export const isKernelControlCommand: TypeGuard<KernelControlCommand> = (
  value: unknown,
): value is KernelControlCommand => is(value, KernelControlCommandStruct);

export const isKernelControlReply: TypeGuard<KernelControlReply> = (
  value: unknown,
): value is KernelControlReply => is(value, KernelControlReplyStruct);
