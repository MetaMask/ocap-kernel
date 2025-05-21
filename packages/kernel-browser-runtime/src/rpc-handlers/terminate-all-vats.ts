import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import type { Kernel } from '@metamask/ocap-kernel';
import { literal } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';

export const terminateAllVatsSpec: MethodSpec<
  'terminateAllVats',
  Json[],
  Promise<null>
> = {
  method: 'terminateAllVats',
  params: EmptyJsonArray,
  result: literal(null),
};

export type TerminateAllVatsHooks = {
  kernel: Pick<Kernel, 'terminateAllVats'>;
};

export const terminateAllVatsHandler: Handler<
  'terminateAllVats',
  Json[],
  Promise<null>,
  TerminateAllVatsHooks
> = {
  ...terminateAllVatsSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }: TerminateAllVatsHooks): Promise<null> => {
    await kernel.terminateAllVats();
    return null;
  },
};
