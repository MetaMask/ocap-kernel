import type { CapData } from '@endo/marshal';
import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import type { Kernel, ClusterConfig, KRef } from '@metamask/ocap-kernel';
import { ClusterConfigStruct, CapDataStruct } from '@metamask/ocap-kernel';
import {
  object,
  string,
  nullable,
  type as structType,
} from '@metamask/superstruct';

/**
 * JSON-compatible version of SubclusterLaunchResult for RPC.
 * Uses null instead of undefined for JSON serialization.
 */
type LaunchSubclusterRpcResult = {
  subclusterId: string;
  rootKref: string;
  bootstrapResult: CapData<KRef> | null;
};

const LaunchSubclusterRpcResultStruct = structType({
  subclusterId: string(),
  rootKref: string(),
  bootstrapResult: nullable(CapDataStruct),
});

export const launchSubclusterSpec: MethodSpec<
  'launchSubcluster',
  { config: ClusterConfig },
  Promise<LaunchSubclusterRpcResult>
> = {
  method: 'launchSubcluster',
  params: object({ config: ClusterConfigStruct }),
  result: LaunchSubclusterRpcResultStruct,
};

export type LaunchSubclusterHooks = {
  kernel: Pick<Kernel, 'launchSubcluster'>;
};

export const launchSubclusterHandler: Handler<
  'launchSubcluster',
  { config: ClusterConfig },
  Promise<LaunchSubclusterRpcResult>,
  LaunchSubclusterHooks
> = {
  ...launchSubclusterSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: LaunchSubclusterHooks,
    params: { config: ClusterConfig },
  ): Promise<LaunchSubclusterRpcResult> => {
    const result = await kernel.launchSubcluster(params.config);
    // Convert undefined to null for JSON compatibility
    return {
      subclusterId: result.subclusterId,
      rootKref: result.rootKref,
      bootstrapResult: result.bootstrapResult ?? null,
    };
  },
};
