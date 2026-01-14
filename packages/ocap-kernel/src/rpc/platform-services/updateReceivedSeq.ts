import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, string, number } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const updateReceivedSeqParamsStruct = object({
  peerId: string(),
  seq: number(),
});

type UpdateReceivedSeqParams = Infer<typeof updateReceivedSeqParamsStruct>;

export type UpdateReceivedSeqSpec = MethodSpec<
  'updateReceivedSeq',
  UpdateReceivedSeqParams,
  null
>;

export const updateReceivedSeqSpec: UpdateReceivedSeqSpec = {
  method: 'updateReceivedSeq',
  params: updateReceivedSeqParamsStruct,
  result: literal(null),
};

export type UpdateReceivedSeq = (peerId: string, seq: number) => null;

type UpdateReceivedSeqHooks = {
  updateReceivedSeq: UpdateReceivedSeq;
};

export type UpdateReceivedSeqHandler = Handler<
  'updateReceivedSeq',
  UpdateReceivedSeqParams,
  null,
  UpdateReceivedSeqHooks
>;

export const updateReceivedSeqHandler: UpdateReceivedSeqHandler = {
  ...updateReceivedSeqSpec,
  hooks: { updateReceivedSeq: true },
  implementation: ({ updateReceivedSeq }, params) => {
    updateReceivedSeq(params.peerId, params.seq);
    return null;
  },
};
