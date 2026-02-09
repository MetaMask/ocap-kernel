import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, string, literal } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const paramsStruct = object({
  peerId: string(),
});

type Params = Infer<typeof paramsStruct>;

export type RemoteIncarnationChangeSpec = MethodSpec<
  'remoteIncarnationChange',
  { peerId: string },
  null
>;

export const remoteIncarnationChangeSpec: RemoteIncarnationChangeSpec = {
  method: 'remoteIncarnationChange',
  params: paramsStruct,
  result: literal(null),
};

export type HandleRemoteIncarnationChange = (peerId: string) => Promise<null>;

type RemoteIncarnationChangeHooks = {
  remoteIncarnationChange: HandleRemoteIncarnationChange;
};

export type RemoteIncarnationChangeHandler = Handler<
  'remoteIncarnationChange',
  Params,
  Promise<null>,
  RemoteIncarnationChangeHooks
>;

export const remoteIncarnationChangeHandler: RemoteIncarnationChangeHandler = {
  ...remoteIncarnationChangeSpec,
  hooks: { remoteIncarnationChange: true },
  implementation: async ({ remoteIncarnationChange }, params) => {
    await remoteIncarnationChange(params.peerId);
    return null;
  },
};
