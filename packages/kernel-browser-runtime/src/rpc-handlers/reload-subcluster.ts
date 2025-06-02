import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type { Kernel, Subcluster } from '@metamask/ocap-kernel';
import { SubclusterStruct } from '@metamask/ocap-kernel';
import { object, string, union, literal } from '@metamask/superstruct';

export const reloadSubclusterSpec: MethodSpec<
  'reloadSubcluster',
  { id: string },
  Promise<Subcluster | null>
> = {
  method: 'reloadSubcluster',
  params: object({ id: string() }),
  result: union([SubclusterStruct, literal(null)]),
};

export type ReloadSubclusterHooks = {
  kernel: Pick<Kernel, 'reloadSubcluster'>;
};

export const reloadSubclusterHandler: Handler<
  'reloadSubcluster',
  { id: string },
  Promise<Subcluster | null>,
  ReloadSubclusterHooks
> = {
  ...reloadSubclusterSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: ReloadSubclusterHooks,
    params: { id: string },
  ): Promise<Subcluster> => {
    const result = await kernel.reloadSubcluster(params.id);
    return result ?? null;
  },
};
