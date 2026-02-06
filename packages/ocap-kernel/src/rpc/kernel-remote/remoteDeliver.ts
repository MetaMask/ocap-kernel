import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, string, union, literal } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';

const paramsStruct = object({
  from: string(),
  message: string(),
});

type Params = Infer<typeof paramsStruct>;

export type RemoteDeliverSpec = MethodSpec<
  'remoteDeliver',
  { from: string; message: string },
  Promise<string | null>
>;

export const remoteDeliverSpec: RemoteDeliverSpec = {
  method: 'remoteDeliver',
  params: paramsStruct,
  result: union([string(), literal(null)]) as Struct<string | null>,
};

export type HandleRemoteDeliver = (
  from: string,
  message: string,
) => Promise<string | null>;

type RemoteDeliverHooks = {
  remoteDeliver: HandleRemoteDeliver;
};

export type RemoteDeliverHandler = Handler<
  'remoteDeliver',
  Params,
  Promise<string | null>,
  RemoteDeliverHooks
>;

export const remoteDeliverHandler: RemoteDeliverHandler = {
  ...remoteDeliverSpec,
  hooks: { remoteDeliver: true },
  implementation: async ({ remoteDeliver }, params) => {
    return await remoteDeliver(params.from, params.message);
  },
};
