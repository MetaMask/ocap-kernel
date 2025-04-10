import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';
import { EmptyJsonArray } from '@ocap/utils';

export const terminateAllSpec: MethodSpec<'terminateAll', Json[], null> = {
  method: 'terminateAll',
  params: EmptyJsonArray,
  result: literal(null),
};

type TerminateHooks = {
  terminateAll: () => Promise<void>;
};

export const terminateAllHandler: Handler<
  'terminateAll',
  Json[],
  null,
  TerminateHooks
> = {
  ...terminateAllSpec,
  hooks: { terminateAll: true },
  implementation: async ({ terminateAll }) => {
    await terminateAll();
    return null;
  },
};
