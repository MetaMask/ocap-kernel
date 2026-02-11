import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { EmptyJsonArray } from '@metamask/kernel-utils';

import type { Kernel } from '../../Kernel.ts';
import type { KernelStatus } from '../../types.ts';
import { KernelStatusStruct } from '../../types.ts';

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
