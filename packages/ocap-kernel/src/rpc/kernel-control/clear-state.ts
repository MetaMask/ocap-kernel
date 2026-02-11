import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

import type { Kernel } from '../../Kernel.ts';

export const clearStateSpec: MethodSpec<'clearState', Json[], Promise<null>> = {
  method: 'clearState',
  params: EmptyJsonArray,
  result: literal(null),
};

export type ClearStateHooks = { kernel: Pick<Kernel, 'reset'> };

export const clearStateHandler: Handler<
  'clearState',
  Json[],
  Promise<null>,
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
