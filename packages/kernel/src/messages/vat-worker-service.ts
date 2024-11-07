import { object, union, optional, is, literal } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { MarshaledErrorStruct } from '@ocap/errors';
import type { TypeGuard } from '@ocap/utils';

import { VatIdStruct, VatMessageIdStruct, VatConfigStruct } from '../types.js';

export const VatWorkerServiceCommandMethod = {
  launch: 'launch',
  terminate: 'terminate',
  terminateAll: 'terminateAll',
} as const;

const VatWorkerServiceCommandStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    object({
      method: literal(VatWorkerServiceCommandMethod.launch),
      params: object({ vatId: VatIdStruct, vatConfig: VatConfigStruct }),
    }),
    object({
      method: literal(VatWorkerServiceCommandMethod.terminate),
      params: object({ vatId: VatIdStruct }),
    }),
    object({
      method: literal(VatWorkerServiceCommandMethod.terminateAll),
      params: literal(null),
    }),
  ]),
});

const VatWorkerServiceCommandReplyStruct = object({
  id: VatMessageIdStruct,
  payload: union([
    object({
      method: union([
        literal(VatWorkerServiceCommandMethod.launch),
        literal(VatWorkerServiceCommandMethod.terminate),
      ]),
      params: object({
        vatId: VatIdStruct,
        error: optional(MarshaledErrorStruct),
      }),
    }),
    object({
      method: literal(VatWorkerServiceCommandMethod.terminateAll),
      params: union([
        literal(null),
        object({
          vatId: optional(VatIdStruct),
          error: MarshaledErrorStruct,
        }),
      ]),
    }),
  ]),
});

export type VatWorkerServiceCommand = Infer<
  typeof VatWorkerServiceCommandStruct
>;
export type VatWorkerServiceReply = Infer<
  typeof VatWorkerServiceCommandReplyStruct
>;

export const isVatWorkerServiceCommand: TypeGuard<VatWorkerServiceCommand> = (
  value: unknown,
): value is VatWorkerServiceCommand => is(value, VatWorkerServiceCommandStruct);

export const isVatWorkerServiceReply: TypeGuard<VatWorkerServiceReply> = (
  value: unknown,
): value is VatWorkerServiceReply =>
  is(value, VatWorkerServiceCommandReplyStruct);
