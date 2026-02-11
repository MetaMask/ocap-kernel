import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';

export const reloadConfigSpec: MethodSpec<
  'reload',
  EmptyJsonArray,
  Promise<null>
> = {
  method: 'reload',
  params: EmptyJsonArray,
  result: literal(null),
};

export type ReloadConfigHooks = { kernel: Pick<Kernel, 'reload'> };

export const reloadConfigHandler: Handler<
  'reload',
  EmptyJsonArray,
  Promise<null>,
  ReloadConfigHooks
> = {
  ...reloadConfigSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }: ReloadConfigHooks): Promise<null> => {
    await kernel.reload();
    return null;
  },
};
