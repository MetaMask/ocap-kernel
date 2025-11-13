import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal, array, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const reconnectPeerParamsStruct = object({
  peerId: string(),
  hints: array(string()),
});

type ReconnectPeerParams = Infer<typeof reconnectPeerParamsStruct>;

export type ReconnectPeerSpec = MethodSpec<
  'reconnectPeer',
  ReconnectPeerParams,
  null
>;

export const reconnectPeerSpec: ReconnectPeerSpec = {
  method: 'reconnectPeer',
  params: reconnectPeerParamsStruct,
  result: literal(null),
};

export type ReconnectPeer = (peerId: string, hints?: string[]) => Promise<null>;

type ReconnectPeerHooks = {
  reconnectPeer: ReconnectPeer;
};

export type ReconnectPeerHandler = Handler<
  'reconnectPeer',
  ReconnectPeerParams,
  Promise<null>,
  ReconnectPeerHooks
>;

export const reconnectPeerHandler: ReconnectPeerHandler = {
  ...reconnectPeerSpec,
  hooks: { reconnectPeer: true },
  implementation: async ({ reconnectPeer }, params) => {
    return await reconnectPeer(params.peerId, params.hints ?? []);
  },
};
