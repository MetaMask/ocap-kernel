import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type {
  Kernel,
  ClusterConfig,
  SubclusterLaunchResult,
} from '@metamask/ocap-kernel';
import { ClusterConfigStruct, CapDataStruct } from '@metamask/ocap-kernel';
import {
  object,
  string,
  optional,
  type as structType,
} from '@metamask/superstruct';

const SubclusterLaunchResultStruct = structType({
  subclusterId: string(),
  bootstrapRootKref: string(),
  bootstrapResult: optional(CapDataStruct),
});

export const launchSubclusterSpec: MethodSpec<
  'launchSubcluster',
  { config: ClusterConfig },
  Promise<SubclusterLaunchResult>
> = {
  method: 'launchSubcluster',
  params: object({ config: ClusterConfigStruct }),
  result: SubclusterLaunchResultStruct,
};

export type LaunchSubclusterHooks = {
  kernel: Pick<Kernel, 'launchSubcluster'>;
};

export const launchSubclusterHandler: Handler<
  'launchSubcluster',
  { config: ClusterConfig },
  Promise<SubclusterLaunchResult>,
  LaunchSubclusterHooks
> = {
  ...launchSubclusterSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: LaunchSubclusterHooks,
    params: { config: ClusterConfig },
  ): Promise<SubclusterLaunchResult> => {
    return kernel.launchSubcluster(params.config);
  },
};
