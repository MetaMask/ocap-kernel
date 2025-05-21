import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';
import { KernelStatusStruct } from '@metamask/ocap-kernel';
import type { Kernel, KernelStatus } from '@metamask/ocap-kernel';

export const getStatusSpec: MethodSpec<
  'getStatus',
  EmptyJsonArray,
  KernelStatus
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
