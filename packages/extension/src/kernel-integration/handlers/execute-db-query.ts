import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type ExecuteDBQueryMethod = typeof KernelControlMethod.executeDBQuery;

export const executeDBQueryHandler: CommandHandler<ExecuteDBQueryMethod> = {
  method: KernelControlMethod.executeDBQuery,
  schema: KernelCommandPayloadStructs.executeDBQuery.schema.params,
  implementation: async (
    _kernel: Kernel,
    kvStore: KVStore,
    params: CommandParams[ExecuteDBQueryMethod],
  ): Promise<Json> => {
    return kvStore.executeQuery(params.sql);
  },
};
