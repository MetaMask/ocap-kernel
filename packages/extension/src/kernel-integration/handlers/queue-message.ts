import type { CapData } from '@endo/marshal';
import { tuple, string, array } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import { CapDataStruct } from '@ocap/kernel';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

/**
 * Enqueue a message to a vat via the kernel's crank queue.
 */
export const queueMessageSpec: MethodSpec<
  'queueMessage',
  [string, string, Json[]],
  CapData<string>
> = {
  method: 'queueMessage',
  params: tuple([string(), string(), array(UnsafeJsonStruct)]),
  result: CapDataStruct,
};

export type QueueMessageHooks = {
  kernel: Pick<Kernel, 'queueMessage'>;
};

export const queueMessageHandler: Handler<
  'queueMessage',
  [string, string, Json[]],
  Promise<CapData<string>>,
  QueueMessageHooks
> = {
  ...queueMessageSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: QueueMessageHooks,
    [target, method, args],
  ): Promise<CapData<string>> => {
    return kernel.queueMessage(target, method, args);
  },
};
