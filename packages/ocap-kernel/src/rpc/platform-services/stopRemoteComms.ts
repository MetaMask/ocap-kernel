import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

const stopRemoteCommsParamsStruct = EmptyJsonArray;

type StopRemoteCommsParams = Json[];

export type StopRemoteCommsSpec = MethodSpec<
  'stopRemoteComms',
  StopRemoteCommsParams,
  null
>;

export const stopRemoteCommsSpec: StopRemoteCommsSpec = {
  method: 'stopRemoteComms',
  params: stopRemoteCommsParamsStruct,
  result: literal(null),
};

export type StopRemoteComms = () => Promise<null>;

type StopRemoteCommsHooks = {
  stopRemoteComms: StopRemoteComms;
};

export type StopRemoteCommsHandler = Handler<
  'stopRemoteComms',
  StopRemoteCommsParams,
  Promise<null>,
  StopRemoteCommsHooks
>;

export const stopRemoteCommsHandler: StopRemoteCommsHandler = {
  ...stopRemoteCommsSpec,
  hooks: { stopRemoteComms: true },
  implementation: async ({ stopRemoteComms }, _params) => {
    return await stopRemoteComms();
  },
};
