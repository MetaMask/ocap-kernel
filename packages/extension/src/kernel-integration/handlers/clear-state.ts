import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';
import { EmptyJsonArray } from '@ocap/utils';

export const clearStateSpec: MethodSpec<'clearState', Json[], null> = {
  method: 'clearState',
  params: EmptyJsonArray,
  result: literal(null),
};

export type ClearStateHooks = { kernel: Pick<Kernel, 'reset'> };

export const clearStateHandler: Handler<
  'clearState',
  Json[],
  null,
  ClearStateHooks
> = {
  ...clearStateSpec,
  method: 'clearState',
  hooks: { kernel: true },
  implementation: async ({ kernel }: ClearStateHooks): Promise<null> => {
    await kernel.reset();
    return null;
  },
};
