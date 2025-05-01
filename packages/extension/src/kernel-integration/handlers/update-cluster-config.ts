import type { ClusterConfig } from '@metamask/ocap-kernel';
import { ClusterConfigStruct } from '@metamask/ocap-kernel';
import { object, literal } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

export const updateClusterConfigSpec: MethodSpec<
  'updateClusterConfig',
  { config: ClusterConfig },
  null
> = {
  method: 'updateClusterConfig',
  params: object({ config: ClusterConfigStruct }),
  result: literal(null),
};

export type UpdateClusterConfigHooks = {
  updateClusterConfig: (config: ClusterConfig) => void;
};

export const updateClusterConfigHandler: Handler<
  'updateClusterConfig',
  { config: ClusterConfig },
  null,
  UpdateClusterConfigHooks
> = {
  ...updateClusterConfigSpec,
  hooks: { updateClusterConfig: true },
  implementation: ({ updateClusterConfig }, params): null => {
    updateClusterConfig(params.config);
    return null;
  },
};
