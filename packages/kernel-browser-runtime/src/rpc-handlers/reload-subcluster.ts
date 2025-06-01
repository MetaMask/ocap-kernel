import type { CapData } from '@endo/marshal';
import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type { Kernel, KRef } from '@metamask/ocap-kernel';
import { CapDataStruct } from '@metamask/ocap-kernel';
import { object, string, union, literal } from '@metamask/superstruct';

export const reloadSubclusterSpec: MethodSpec<
  'reloadSubcluster',
  { id: string },
  Promise<CapData<KRef> | null>
> = {
  method: 'reloadSubcluster',
  params: object({ id: string() }),
  result: union([CapDataStruct, literal(null)]),
};

export type ReloadSubclusterHooks = {
  kernel: Pick<Kernel, 'reloadSubcluster'>;
};

export const reloadSubclusterHandler: Handler<
  'reloadSubcluster',
  { id: string },
  Promise<CapData<KRef> | null>,
  ReloadSubclusterHooks
> = {
  ...reloadSubclusterSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: ReloadSubclusterHooks,
    params: { id: string },
  ): Promise<CapData<KRef> | null> => {
    const result = await kernel.reloadSubcluster(params.id);
    return result ?? null;
  },
};
