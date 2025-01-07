import { assert } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

import type { CommandHandler, CommandParams } from '../command-registry.js';
import {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from '../messages.js';

type ExecuteDBQueryMethod = typeof KernelControlMethod.executeDBQuery;

export const executeDBQueryHandler: CommandHandler<ExecuteDBQueryMethod> = {
  validate: (
    params: unknown,
  ): params is CommandParams[ExecuteDBQueryMethod] => {
    try {
      assert(params, KernelCommandPayloadStructs.executeDBQuery.schema.params);
      return true;
    } catch {
      return false;
    }
  },

  async execute(
    _kernel: Kernel,
    kvStore: KVStore,
    params: CommandParams[ExecuteDBQueryMethod],
  ): Promise<Json> {
    return kvStore.executeQuery(params.sql);
  },
};
