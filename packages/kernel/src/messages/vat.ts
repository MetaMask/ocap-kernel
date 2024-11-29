import {
  object,
  union,
  literal,
  record,
  refine,
  string,
  is,
  array,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import { MethodSchemaStruct } from '@ocap/utils';

import { isVatId } from '../types.js';
import type { VatId } from '../types.js';

type VatMessageId = `${VatId}:${number}`;

const isVatMessageId = (value: unknown): value is VatMessageId =>
  typeof value === 'string' &&
  /^\w+:\d+$/u.test(value) &&
  isVatId(value.split(':')[0]);

export const VatTestCommandMethod = {
  evaluate: 'evaluate',
  ping: 'ping',
} as const;

export const VatCommandMethod = {
  ...VatTestCommandMethod,
  capTpInit: 'capTpInit',
  loadUserCode: 'loadUserCode',
  getMethodSchema: 'getMethodSchema',
} as const;

const VatMessageIdStruct = refine(string(), 'VatMessageId', isVatMessageId);

export const VatTestMethodStructs = {
  [VatCommandMethod.evaluate]: object({
    method: literal(VatCommandMethod.evaluate),
    params: string(),
  }),
  [VatCommandMethod.ping]: object({
    method: literal(VatCommandMethod.ping),
    params: literal(null),
  }),
} as const;

export const VatMethodStructs = {
  ...VatTestMethodStructs,
  [VatCommandMethod.capTpInit]: object({
    method: literal(VatCommandMethod.capTpInit),
    params: literal(null),
  }),
  [VatCommandMethod.loadUserCode]: object({
    method: literal(VatCommandMethod.loadUserCode),
    params: record(string(), UnsafeJsonStruct),
  }),
  [VatCommandMethod.getMethodSchema]: object({
    method: literal(VatCommandMethod.getMethodSchema),
    params: literal(null),
  }),
} as const;

const VatCommandStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    VatMethodStructs.evaluate,
    VatMethodStructs.ping,
    VatMethodStructs.capTpInit,
    VatMethodStructs.loadUserCode,
    VatMethodStructs.getMethodSchema,
  ]),
});

export type VatCommand = Infer<typeof VatCommandStruct>;

export const VatTestReplyStructs = {
  [VatCommandMethod.evaluate]: object({
    method: literal(VatCommandMethod.evaluate),
    params: string(),
  }),
  [VatCommandMethod.ping]: object({
    method: literal(VatCommandMethod.ping),
    params: string(),
  }),
} as const;

const VatReplyStructs = {
  ...VatTestReplyStructs,
  [VatCommandMethod.capTpInit]: object({
    method: literal(VatCommandMethod.capTpInit),
    params: string(),
  }),
  [VatCommandMethod.loadUserCode]: object({
    method: literal(VatCommandMethod.loadUserCode),
    params: string(),
  }),
  [VatCommandMethod.getMethodSchema]: object({
    method: literal(VatCommandMethod.getMethodSchema),
    params: array(MethodSchemaStruct),
  }),
} as const;

const VatCommandReplyStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    VatReplyStructs.evaluate,
    VatReplyStructs.ping,
    VatReplyStructs.capTpInit,
    VatReplyStructs.loadUserCode,
    VatReplyStructs.getMethodSchema,
  ]),
});

export type VatCommandReply = Infer<typeof VatCommandReplyStruct>;

export const isVatCommand = (value: unknown): value is VatCommand =>
  is(value, VatCommandStruct);

export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  is(value, VatCommandReplyStruct);
