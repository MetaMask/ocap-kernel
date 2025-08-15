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
  kernel: Pick<Kernel, 'getStatus'>;
};

export const getStatusHandler: Handler<
  'getStatus',
  EmptyJsonArray,
  Promise<KernelStatus>,
  GetStatusHooks
> = {
  ...getStatusSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }: GetStatusHooks): Promise<KernelStatus> => {
    return await kernel.getStatus();
  },
};
