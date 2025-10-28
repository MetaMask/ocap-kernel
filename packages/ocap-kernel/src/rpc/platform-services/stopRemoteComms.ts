import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

export type StopRemoteCommsSpec = MethodSpec<'stopRemoteComms', Json[], null>;

export const stopRemoteCommsSpec: StopRemoteCommsSpec = {
  method: 'stopRemoteComms',
  params: EmptyJsonArray,
  result: literal(null),
};

export type StopRemoteCommsImpl = () => Promise<null>;

type StopRemoteCommsHooks = {
  stopRemoteComms: StopRemoteCommsImpl;
};

export type StopRemoteCommsHandler = Handler<
  'stopRemoteComms',
  Json[],
  Promise<null>,
  StopRemoteCommsHooks
>;

export const stopRemoteCommsHandler: StopRemoteCommsHandler = {
  ...stopRemoteCommsSpec,
  hooks: { stopRemoteComms: true },
  implementation: async ({ stopRemoteComms }, _params) => {
    await stopRemoteComms();
    return null;
  },
};
