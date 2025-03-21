import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

export const executeDBQueryHandler: CommandHandler<'executeDBQuery'> = {
  method: 'executeDBQuery',
  schema: KernelCommandPayloadStructs.executeDBQuery.schema.params,
  implementation: async (
    _kernel: Kernel,
    kvStore: KVStore,
    params: CommandParams['executeDBQuery'],
  ): Promise<Json> => {
    return kvStore.executeQuery(params.sql);
  },
};
