import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

import type { StopRemoteComms } from '../../types.ts';

export type StopRemoteCommsSpec = MethodSpec<'stopRemoteComms', Json[], null>;

export const stopRemoteCommsSpec: StopRemoteCommsSpec = {
  method: 'stopRemoteComms',
  params: EmptyJsonArray,
  result: literal(null),
};

type StopRemoteCommsHooks = {
  stopRemoteComms: StopRemoteComms;
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
