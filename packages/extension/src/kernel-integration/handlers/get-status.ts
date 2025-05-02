import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import {
  ClusterConfigStruct,
  VatConfigStruct,
  VatIdStruct,
} from '@metamask/ocap-kernel';
import type { Kernel } from '@metamask/ocap-kernel';
import { nullable, type, array, object } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

const KernelStatusStruct = type({
  clusterConfig: nullable(ClusterConfigStruct),
  vats: array(
    object({
      id: VatIdStruct,
      config: VatConfigStruct,
    }),
  ),
});

export type KernelStatus = Infer<typeof KernelStatusStruct>;

export const getStatusSpec: MethodSpec<
  'getStatus',
  EmptyJsonArray,
  Infer<typeof KernelStatusStruct>
> = {
  method: 'getStatus',
  params: EmptyJsonArray,
  result: KernelStatusStruct,
};

export type GetStatusHooks = {
  kernel: Pick<Kernel, 'getVats' | 'clusterConfig'>;
};

export const getStatusHandler: Handler<
  'getStatus',
  EmptyJsonArray,
  KernelStatus,
  GetStatusHooks
> = {
  ...getStatusSpec,
  hooks: { kernel: true },
  implementation: ({ kernel }: GetStatusHooks): KernelStatus => ({
    vats: kernel.getVats(),
    clusterConfig: kernel.clusterConfig,
  }),
};
