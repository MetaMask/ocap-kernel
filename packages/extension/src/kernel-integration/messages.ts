import {
  object,
  union,
  literal,
  array,
  type,
  is,
  string,
  record,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { VatConfig, VatId } from '@ocap/kernel';
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
  executeDBQuery: 'executeDBQuery',
} as const;

export type KernelStatus = {
  vats: {
    id: VatId;
    config: VatConfig;
  }[];
};

const KernelStatusStruct = type({
  vats: array(
    object({
      id: VatIdStruct,
      config: VatConfigStruct,
    }),
  ),
});

// Command payload structs
const KernelCommandPayloadStructs = {
  [KernelControlMethod.launchVat]: object({
    method: literal(KernelControlMethod.launchVat),
    params: VatConfigStruct,
  }),
  [KernelControlMethod.restartVat]: object({
    method: literal(KernelControlMethod.restartVat),
    params: object({ id: VatIdStruct }),
  }),
  [KernelControlMethod.terminateVat]: object({
    method: literal(KernelControlMethod.terminateVat),
    params: object({ id: VatIdStruct }),
  }),
  [KernelControlMethod.terminateAllVats]: object({
    method: literal(KernelControlMethod.terminateAllVats),
    params: literal(null),
  }),
  [KernelControlMethod.getStatus]: object({
    method: literal(KernelControlMethod.getStatus),
    params: literal(null),
  }),
  [KernelControlMethod.sendMessage]: object({
    method: literal(KernelControlMethod.sendMessage),
    params: object({
      id: union([VatIdStruct, literal(undefined)]),
      payload: UnsafeJsonStruct,
    }),
  }),
  [KernelControlMethod.clearState]: object({
    method: literal(KernelControlMethod.clearState),
    params: literal(null),
  }),
  [KernelControlMethod.executeDBQuery]: object({
    method: literal(KernelControlMethod.executeDBQuery),
    params: object({
      sql: string(),
    }),
  }),
} as const;

const KernelReplyPayloadStructs = {
  [KernelControlMethod.launchVat]: object({
    method: literal(KernelControlMethod.launchVat),
    params: union([literal(null), object({ error: string() })]),
  }),
  [KernelControlMethod.restartVat]: object({
    method: literal(KernelControlMethod.restartVat),
    params: union([literal(null), object({ error: string() })]),
  }),
  [KernelControlMethod.terminateVat]: object({
    method: literal(KernelControlMethod.terminateVat),
    params: union([literal(null), object({ error: string() })]),
  }),
  [KernelControlMethod.terminateAllVats]: object({
    method: literal(KernelControlMethod.terminateAllVats),
    params: union([literal(null), object({ error: string() })]),
  }),
  [KernelControlMethod.getStatus]: object({
    method: literal(KernelControlMethod.getStatus),
    params: union([KernelStatusStruct, object({ error: string() })]),
  }),
  [KernelControlMethod.sendMessage]: object({
    method: literal(KernelControlMethod.sendMessage),
    params: UnsafeJsonStruct,
  }),
  [KernelControlMethod.clearState]: object({
    method: literal(KernelControlMethod.clearState),
    params: literal(null),
  }),
  [KernelControlMethod.executeDBQuery]: object({
    method: literal(KernelControlMethod.executeDBQuery),
    params: union([
      array(record(string(), string())),
      object({ error: string() }),
    ]),
  }),
} as const;

const KernelControlCommandStruct = object({
  id: string(),
  payload: union([
    KernelCommandPayloadStructs.launchVat,
    KernelCommandPayloadStructs.restartVat,
    KernelCommandPayloadStructs.terminateVat,
    KernelCommandPayloadStructs.terminateAllVats,
    KernelCommandPayloadStructs.getStatus,
    KernelCommandPayloadStructs.sendMessage,
    KernelCommandPayloadStructs.clearState,
    KernelCommandPayloadStructs.executeDBQuery,
  ]),
});

const KernelControlReplyStruct = object({
  id: string(),
  payload: union([
    KernelReplyPayloadStructs.launchVat,
    KernelReplyPayloadStructs.restartVat,
    KernelReplyPayloadStructs.terminateVat,
    KernelReplyPayloadStructs.terminateAllVats,
    KernelReplyPayloadStructs.getStatus,
    KernelReplyPayloadStructs.sendMessage,
    KernelReplyPayloadStructs.clearState,
    KernelReplyPayloadStructs.executeDBQuery,
  ]),
});

export type KernelControlCommand = Infer<typeof KernelControlCommandStruct> &
  Json;
export type KernelControlReply = Infer<typeof KernelControlReplyStruct>;

export type KernelReplyParams<
  Method extends keyof typeof KernelReplyPayloadStructs,
> = Infer<(typeof KernelReplyPayloadStructs)[Method]>['params'];

export type KernelControlReturnType = {
  [Method in keyof typeof KernelReplyPayloadStructs]: KernelReplyParams<Method>;
};

export const isKernelControlCommand: TypeGuard<KernelControlCommand> = (
  value: unknown,
): value is KernelControlCommand => is(value, KernelControlCommandStruct);

export const isKernelControlReply: TypeGuard<KernelControlReply> = (
  value: unknown,
): value is KernelControlReply => is(value, KernelControlReplyStruct);

export const isKernelStatus: TypeGuard<KernelStatus> = (
  value,
): value is KernelStatus => is(value, KernelStatusStruct);
