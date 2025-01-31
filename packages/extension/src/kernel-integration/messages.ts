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

export const KernelControlMethod = {
  launchVat: 'launchVat',
  restartVat: 'restartVat',
  terminateVat: 'terminateVat',
  terminateAllVats: 'terminateAllVats',
  getStatus: 'getStatus',
  reload: 'reload',
  sendVatCommand: 'sendVatCommand',
  clearState: 'clearState',
  executeDBQuery: 'executeDBQuery',
  updateClusterConfig: 'updateClusterConfig',
} as const;

export type KernelMethods = keyof typeof KernelControlMethod;

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
  [KernelControlMethod.reload]: object({
    method: literal(KernelControlMethod.reload),
    params: literal(null),
  }),
  [KernelControlMethod.sendVatCommand]: object({
    method: literal(KernelControlMethod.sendVatCommand),
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
  [KernelControlMethod.updateClusterConfig]: object({
    method: literal(KernelControlMethod.updateClusterConfig),
    params: object({
      config: ClusterConfigStruct,
    }),
  }),
} as const;

export const KernelReplyPayloadStructs = {
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
  [KernelControlMethod.reload]: object({
    method: literal(KernelControlMethod.reload),
    params: union([literal(null), object({ error: string() })]),
  }),
  [KernelControlMethod.sendVatCommand]: object({
    method: literal(KernelControlMethod.sendVatCommand),
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
  [KernelControlMethod.updateClusterConfig]: object({
    method: literal(KernelControlMethod.updateClusterConfig),
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
