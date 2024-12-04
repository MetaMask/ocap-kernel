import {
  object,
  union,
  literal,
  refine,
  string,
  is,
  array,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { MethodSchemaStruct } from '@ocap/utils';

import {
  isSupervisorId,
  isVatId,
  VatConfigStruct,
  VatIdStruct,
} from '../types.js';
import type { VatId } from '../types.js';

type VatMessageId = `${VatId}:${number}`;

export const isVatMessageStreamId = (value: unknown): value is VatMessageId =>
  typeof value === 'string' &&
  /^\w+:\d+$/u.test(value) &&
  (isVatId(value.split(':')[0]) || isSupervisorId(value.split(':')[0]));

export const VatCommandMethod = {
  ping: 'ping',
  capTpInit: 'capTpInit',
  initSupervisor: 'initSupervisor',
  getMethodSchema: 'getMethodSchema',
  storage: 'storage',
} as const;

export const VatStorageMethod = {
  get: 'store.get',
  set: 'store.set',
  delete: 'store.delete',
} as const;

const VatMessageIdStruct = refine(
  string(),
  'VatMessageId',
  isVatMessageStreamId,
);

const VatStorageMethodStruct = object({
  method: literal(VatCommandMethod.storage),
  params: union([
    object({
      method: literal(VatStorageMethod.get),
      params: string(),
    }),
    object({
      method: literal(VatStorageMethod.set),
      params: object({
        key: string(),
        value: string(),
      }),
    }),
    object({
      method: literal(VatStorageMethod.delete),
      params: string(),
    }),
  ]),
});

export const VatMethodStructs = {
  [VatCommandMethod.ping]: object({
    method: literal(VatCommandMethod.ping),
    params: literal(null),
  }),
  [VatCommandMethod.capTpInit]: object({
    method: literal(VatCommandMethod.capTpInit),
    params: literal(null),
  }),
  [VatCommandMethod.initSupervisor]: object({
    method: literal(VatCommandMethod.initSupervisor),
    params: object({
      vatId: VatIdStruct,
      config: VatConfigStruct,
    }),
  }),
  [VatCommandMethod.getMethodSchema]: object({
    method: literal(VatCommandMethod.getMethodSchema),
    params: literal(null),
  }),
  [VatCommandMethod.storage]: VatStorageMethodStruct,
} as const;

const VatCommandStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    VatMethodStructs.ping,
    VatMethodStructs.capTpInit,
    VatMethodStructs.initSupervisor,
    VatMethodStructs.getMethodSchema,
    VatMethodStructs.storage,
  ]),
});

export type VatCommand = Infer<typeof VatCommandStruct>;

export const VatReplyStructs = {
  [VatCommandMethod.ping]: object({
    method: literal(VatCommandMethod.ping),
    params: string(),
  }),
  [VatCommandMethod.capTpInit]: object({
    method: literal(VatCommandMethod.capTpInit),
    params: string(),
  }),
  [VatCommandMethod.initSupervisor]: object({
    method: literal(VatCommandMethod.initSupervisor),
    params: string(),
  }),
  [VatCommandMethod.getMethodSchema]: object({
    method: literal(VatCommandMethod.getMethodSchema),
    params: array(MethodSchemaStruct),
  }),
  [VatCommandMethod.storage]: VatStorageMethodStruct,
} as const;

const VatCommandReplyStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    VatReplyStructs.ping,
    VatReplyStructs.capTpInit,
    VatReplyStructs.initSupervisor,
    VatReplyStructs.getMethodSchema,
    VatReplyStructs.storage,
  ]),
});

export type VatCommandReply = Infer<typeof VatCommandReplyStruct>;

export const isVatCommand = (value: unknown): value is VatCommand =>
  is(value, VatCommandStruct);

export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  is(value, VatCommandReplyStruct);

export const isVatStorageMethod = (
  value: unknown,
): value is Infer<typeof VatStorageMethodStruct> =>
  is(value, VatStorageMethodStruct);

export type VatCommandParams<Method extends keyof typeof VatCommandMethod> =
  Infer<(typeof VatMethodStructs)[Method]>['params'];

export type VatReplyParams<Method extends keyof typeof VatReplyStructs> = Infer<
  (typeof VatReplyStructs)[Method]
>['params'];

export type VatCommandReturnType = {
  [Method in keyof typeof VatReplyStructs]: VatReplyParams<Method>;
};
