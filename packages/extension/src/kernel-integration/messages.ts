import {
  object,
  union,
  literal,
  array,
  type,
  is,
  string,
  record,
  empty,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import {
  ClusterConfigStruct,
  VatConfigStruct,
  VatIdStruct,
} from '@ocap/kernel';
import type { TypeGuard } from '@ocap/utils';

const KernelStatusStruct = type({
  clusterConfig: ClusterConfigStruct,
  vats: array(
    object({
      id: VatIdStruct,
      config: VatConfigStruct,
    }),
  ),
});

export type KernelStatus = Infer<typeof KernelStatusStruct>;

const EmptyArrayStruct = empty(array(UnsafeJsonStruct));

// Command payload structs
export const KernelCommandPayloadStructs = {
  launchVat: object({
    method: literal('launchVat'),
    params: VatConfigStruct,
  }),
  restartVat: object({
    method: literal('restartVat'),
    params: object({ id: VatIdStruct }),
  }),
  terminateVat: object({
    method: literal('terminateVat'),
    params: object({ id: VatIdStruct }),
  }),
  terminateAllVats: object({
    method: literal('terminateAllVats'),
    params: EmptyArrayStruct,
  }),
  getStatus: object({
    method: literal('getStatus'),
    params: EmptyArrayStruct,
  }),
  reload: object({
    method: literal('reload'),
    params: EmptyArrayStruct,
  }),
  sendVatCommand: object({
    method: literal('sendVatCommand'),
    params: object({
      id: union([VatIdStruct, literal(null)]),
      payload: UnsafeJsonStruct,
    }),
  }),
  clearState: object({
    method: literal('clearState'),
    params: EmptyArrayStruct,
  }),
  executeDBQuery: object({
    method: literal('executeDBQuery'),
    params: object({
      sql: string(),
    }),
  }),
  updateClusterConfig: object({
    method: literal('updateClusterConfig'),
    params: object({
      config: ClusterConfigStruct,
    }),
  }),
} as const;

export const KernelReplyPayloadStructs = {
  launchVat: object({
    method: literal('launchVat'),
    result: union([literal(null), object({ error: string() })]),
  }),
  restartVat: object({
    method: literal('restartVat'),
    result: union([literal(null), object({ error: string() })]),
  }),
  terminateVat: object({
    method: literal('terminateVat'),
    result: union([literal(null), object({ error: string() })]),
  }),
  terminateAllVats: object({
    method: literal('terminateAllVats'),
    result: union([literal(null), object({ error: string() })]),
  }),
  getStatus: object({
    method: literal('getStatus'),
    result: union([KernelStatusStruct, object({ error: string() })]),
  }),
  reload: object({
    method: literal('reload'),
    result: union([literal(null), object({ error: string() })]),
  }),
  sendVatCommand: object({
    method: literal('sendVatCommand'),
    result: UnsafeJsonStruct,
  }),
  clearState: object({
    method: literal('clearState'),
    result: literal(null),
  }),
  executeDBQuery: object({
    method: literal('executeDBQuery'),
    result: union([
      array(record(string(), string())),
      object({ error: string() }),
    ]),
  }),
  updateClusterConfig: object({
    method: literal('updateClusterConfig'),
    result: literal(null),
  }),
} as const;

const KernelControlCommandStruct = union([
  KernelCommandPayloadStructs.launchVat,
  KernelCommandPayloadStructs.restartVat,
  KernelCommandPayloadStructs.terminateVat,
  KernelCommandPayloadStructs.terminateAllVats,
  KernelCommandPayloadStructs.getStatus,
  KernelCommandPayloadStructs.reload,
  KernelCommandPayloadStructs.sendVatCommand,
  KernelCommandPayloadStructs.clearState,
  KernelCommandPayloadStructs.executeDBQuery,
  KernelCommandPayloadStructs.updateClusterConfig,
]);

const KernelControlReplyStruct = union([
  KernelReplyPayloadStructs.launchVat,
  KernelReplyPayloadStructs.restartVat,
  KernelReplyPayloadStructs.terminateVat,
  KernelReplyPayloadStructs.terminateAllVats,
  KernelReplyPayloadStructs.getStatus,
  KernelReplyPayloadStructs.reload,
  KernelReplyPayloadStructs.sendVatCommand,
  KernelReplyPayloadStructs.clearState,
  KernelReplyPayloadStructs.executeDBQuery,
  KernelReplyPayloadStructs.updateClusterConfig,
]);

export type KernelControlCommand = Infer<typeof KernelControlCommandStruct>;
export type KernelControlReply = Infer<typeof KernelControlReplyStruct>;

export type KernelControlResult<
  Method extends keyof typeof KernelReplyPayloadStructs,
> = Infer<(typeof KernelReplyPayloadStructs)[Method]>['result'];

export type KernelControlReturnType = {
  [Method in keyof typeof KernelReplyPayloadStructs]: KernelControlResult<Method>;
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

export const UiControlMethod = {
  init: 'init',
} as const;

export type UiControlMethod = keyof typeof UiControlMethod;

const UiControlCommandStruct = object({
  method: literal(UiControlMethod.init),
  params: string(), // The UI instance's BroadcastChannel name
});

export type UiControlCommand = Infer<typeof UiControlCommandStruct>;

export const isUiControlCommand: TypeGuard<UiControlCommand> = (
  value: unknown,
): value is UiControlCommand => is(value, UiControlCommandStruct);
