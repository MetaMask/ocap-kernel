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
    params: literal(null),
  }),
  getStatus: object({
    method: literal('getStatus'),
    params: literal(null),
  }),
  reload: object({
    method: literal('reload'),
    params: literal(null),
  }),
  sendVatCommand: object({
    method: literal('sendVatCommand'),
    params: object({
      id: union([VatIdStruct, literal(undefined)]),
      payload: UnsafeJsonStruct,
    }),
  }),
  clearState: object({
    method: literal('clearState'),
    params: literal(null),
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
    params: union([literal(null), object({ error: string() })]),
  }),
  restartVat: object({
    method: literal('restartVat'),
    params: union([literal(null), object({ error: string() })]),
  }),
  terminateVat: object({
    method: literal('terminateVat'),
    params: union([literal(null), object({ error: string() })]),
  }),
  terminateAllVats: object({
    method: literal('terminateAllVats'),
    params: union([literal(null), object({ error: string() })]),
  }),
  getStatus: object({
    method: literal('getStatus'),
    params: union([KernelStatusStruct, object({ error: string() })]),
  }),
  reload: object({
    method: literal('reload'),
    params: union([literal(null), object({ error: string() })]),
  }),
  sendVatCommand: object({
    method: literal('sendVatCommand'),
    params: UnsafeJsonStruct,
  }),
  clearState: object({
    method: literal('clearState'),
    params: literal(null),
  }),
  executeDBQuery: object({
    method: literal('executeDBQuery'),
    params: union([
      array(record(string(), string())),
      object({ error: string() }),
    ]),
  }),
  updateClusterConfig: object({
    method: literal('updateClusterConfig'),
    params: literal(null),
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
    KernelCommandPayloadStructs.reload,
    KernelCommandPayloadStructs.sendVatCommand,
    KernelCommandPayloadStructs.clearState,
    KernelCommandPayloadStructs.executeDBQuery,
    KernelCommandPayloadStructs.updateClusterConfig,
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
    KernelReplyPayloadStructs.reload,
    KernelReplyPayloadStructs.sendVatCommand,
    KernelReplyPayloadStructs.clearState,
    KernelReplyPayloadStructs.executeDBQuery,
    KernelReplyPayloadStructs.updateClusterConfig,
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
