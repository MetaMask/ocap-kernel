import {
  object,
  union,
  literal,
  refine,
  string,
  is,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import { isVatId } from '../types.js';
import type { VatId } from '../types.js';

type VatMessageId = `${VatId}:${number}`;

const isVatMessageId = (value: unknown): value is VatMessageId =>
  typeof value === 'string' &&
  /^\w+:\d+$/u.test(value) &&
  isVatId(value.split(':')[0]);

export enum VatCommandMethod {
  Evaluate = 'evaluate',
  Ping = 'ping',
  CapTpInit = 'capTpInit',
}

const VatMessageIdStruct = refine(string(), 'VatMessageId', isVatMessageId);

const VatCommandStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    object({ method: literal(VatCommandMethod.Evaluate), params: string() }),
    object({ method: literal(VatCommandMethod.Ping), params: literal(null) }),
    object({
      method: literal(VatCommandMethod.CapTpInit),
      params: literal(null),
    }),
  ]),
});

export type VatCommand = Infer<typeof VatCommandStruct>;

export type VatCommandReply = Infer<typeof VatCommandReplyStruct>;

const VatCommandReplyStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    object({ method: literal(VatCommandMethod.Evaluate), params: string() }),
    object({ method: literal(VatCommandMethod.Ping), params: string() }),
    object({ method: literal(VatCommandMethod.CapTpInit), params: string() }),
  ]),
});

export const isVatCommand = (value: unknown): value is VatCommand =>
  is(value, VatCommandStruct);

export const isVatCommandReply = (value: unknown): value is VatCommandReply =>
  is(value, VatCommandReplyStruct);
