import type { CapData } from '@endo/marshal';
import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type { Kernel, ClusterConfig, KRef } from '@metamask/ocap-kernel';
import { CapDataStruct, ClusterConfigStruct } from '@metamask/ocap-kernel';
import { object, nullable } from '@metamask/superstruct';

export const launchSubclusterSpec: MethodSpec<
  'launchSubcluster',
  { config: ClusterConfig },
  Promise<CapData<KRef> | null>
> = {
  method: 'launchSubcluster',
  params: object({ config: ClusterConfigStruct }),
  result: nullable(CapDataStruct),
};

export type LaunchSubclusterHooks = {
  kernel: Pick<Kernel, 'launchSubcluster'>;
};

export const launchSubclusterHandler: Handler<
  'launchSubcluster',
  { config: ClusterConfig },
  Promise<CapData<KRef> | null>,
  LaunchSubclusterHooks
> = {
  ...launchSubclusterSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: LaunchSubclusterHooks,
    params: { config: ClusterConfig },
  ): Promise<CapData<KRef> | null> => {
    const result = await kernel.launchSubcluster(params.config);
    return result ?? null;
  },
};
