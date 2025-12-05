import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, string, literal } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const paramsStruct = object({
  peerId: string(),
});

type Params = Infer<typeof paramsStruct>;

export type RemoteGiveUpSpec = MethodSpec<
  'remoteGiveUp',
  { peerId: string },
  null
>;

export const remoteGiveUpSpec: RemoteGiveUpSpec = {
  method: 'remoteGiveUp',
  params: paramsStruct,
  result: literal(null),
};

export type HandleRemoteGiveUp = (peerId: string) => Promise<null>;

type RemoteGiveUpHooks = {
  remoteGiveUp: HandleRemoteGiveUp;
};

export type RemoteGiveUpHandler = Handler<
  'remoteGiveUp',
  Params,
  Promise<null>,
  RemoteGiveUpHooks
>;

export const remoteGiveUpHandler: RemoteGiveUpHandler = {
  ...remoteGiveUpSpec,
  hooks: { remoteGiveUp: true },
  implementation: async ({ remoteGiveUp }, params) => {
    await remoteGiveUp(params.peerId);
    return null;
  },
};
