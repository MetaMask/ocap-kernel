import type { CapData } from '@endo/marshal';
import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { tuple, string, array } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';

import type { Kernel } from '../../Kernel.ts';
import type { KRef } from '../../types.ts';
import { CapDataStruct, KRefStruct } from '../../types.ts';

/**
 * Enqueue a message to a vat via the kernel's crank queue.
 */
export const queueMessageSpec: MethodSpec<
  'queueMessage',
  [KRef, string, Json[]],
  CapData<KRef>
> = {
  method: 'queueMessage',
  params: tuple([KRefStruct, string(), array(UnsafeJsonStruct)]),
  result: CapDataStruct,
} as unknown as MethodSpec<
  'queueMessage',
  [KRef, string, Json[]],
  CapData<KRef>
>;

export type QueueMessageHooks = {
  kernel: Pick<Kernel, 'queueMessage'>;
};

export const queueMessageHandler: Handler<
  'queueMessage',
  [KRef, string, Json[]],
  Promise<CapData<KRef>>,
  QueueMessageHooks
> = {
  ...queueMessageSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: QueueMessageHooks,
    [target, method, args],
  ): Promise<CapData<KRef>> => {
    return kernel.queueMessage(target, method, args);
  },
};
