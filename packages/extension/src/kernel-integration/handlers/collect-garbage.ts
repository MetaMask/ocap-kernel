import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import type { Kernel } from '@metamask/ocap-kernel';
import { literal } from '@metamask/superstruct';

export const collectGarbageSpec: MethodSpec<
  'collectGarbage',
  EmptyJsonArray,
  null
> = {
  method: 'collectGarbage',
  params: EmptyJsonArray,
  result: literal(null),
};

export type CollectGarbageHooks = { kernel: Pick<Kernel, 'collectGarbage'> };

export const collectGarbageHandler: Handler<
  'collectGarbage',
  EmptyJsonArray,
  null,
  CollectGarbageHooks
> = {
  ...collectGarbageSpec,
  hooks: { kernel: true },
  implementation: ({ kernel }) => {
    kernel.collectGarbage();
    return null;
  },
};
