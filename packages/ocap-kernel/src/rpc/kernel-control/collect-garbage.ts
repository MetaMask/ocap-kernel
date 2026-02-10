import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { literal } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';

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
