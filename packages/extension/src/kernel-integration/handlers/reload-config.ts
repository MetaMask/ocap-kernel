import { EmptyJsonArray } from '@metamask/kernel-utils';
import type { Kernel } from '@metamask/ocap-kernel';
import { literal } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

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
