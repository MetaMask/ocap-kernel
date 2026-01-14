import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, string, number } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const handleAckParamsStruct = object({
  peerId: string(),
  ackSeq: number(),
});

type HandleAckParams = Infer<typeof handleAckParamsStruct>;

export type HandleAckSpec = MethodSpec<'handleAck', HandleAckParams, null>;

export const handleAckSpec: HandleAckSpec = {
  method: 'handleAck',
  params: handleAckParamsStruct,
  result: literal(null),
};

export type HandleAck = (peerId: string, ackSeq: number) => Promise<null>;

type HandleAckHooks = {
  handleAck: HandleAck;
};

export type HandleAckHandler = Handler<
  'handleAck',
  HandleAckParams,
  Promise<null>,
  HandleAckHooks
>;

export const handleAckHandler: HandleAckHandler = {
  ...handleAckSpec,
  hooks: { handleAck: true },
  implementation: async ({ handleAck }, params) => {
    return await handleAck(params.peerId, params.ackSeq);
  },
};
