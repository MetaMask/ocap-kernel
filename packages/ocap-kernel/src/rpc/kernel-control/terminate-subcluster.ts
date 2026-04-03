import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { SubclusterId } from '../../types.ts';
import { SubclusterIdStruct } from '../../types.ts';

export const terminateSubclusterSpec: MethodSpec<
  'terminateSubcluster',
  { id: SubclusterId },
  Promise<null>
> = {
  method: 'terminateSubcluster',
  params: object({ id: SubclusterIdStruct }),
  result: literal(null),
};

export type TerminateSubclusterHooks = {
  kernel: Pick<Kernel, 'terminateSubcluster'>;
};

export const terminateSubclusterHandler: Handler<
  'terminateSubcluster',
  { id: SubclusterId },
  Promise<null>,
  TerminateSubclusterHooks
> = {
  ...terminateSubclusterSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: TerminateSubclusterHooks,
    params: { id: SubclusterId },
  ): Promise<null> => {
    await kernel.terminateSubcluster(params.id);
    return null;
  },
};
