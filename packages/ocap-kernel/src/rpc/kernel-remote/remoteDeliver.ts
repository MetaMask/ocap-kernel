import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const paramsStruct = object({
  from: string(),
  message: string(),
});

type Params = Infer<typeof paramsStruct>;

export type RemoteDeliverSpec = MethodSpec<
  'remoteDeliver',
  { from: string; message: string },
  string
>;

export const remoteDeliverSpec: RemoteDeliverSpec = {
  method: 'remoteDeliver',
  params: paramsStruct,
  result: string(),
};

export type HandleRemoteDeliver = (
  from: string,
  message: string,
) => Promise<string>;

type RemoteDeliverHooks = {
  remoteDeliver: HandleRemoteDeliver;
};

export type RemoteDeliverHandler = Handler<
  'remoteDeliver',
  Params,
  Promise<string>,
  RemoteDeliverHooks
>;

export const remoteDeliverHandler: RemoteDeliverHandler = {
  ...remoteDeliverSpec,
  hooks: { remoteDeliver: true },
  implementation: async ({ remoteDeliver }, params) => {
    return await remoteDeliver(params.from, params.message);
  },
};
