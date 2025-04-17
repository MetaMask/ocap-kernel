import { literal } from '@metamask/superstruct';
import type { Kernel } from '@ocap/kernel';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';
import { EmptyJsonArray } from '@ocap/utils';

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
