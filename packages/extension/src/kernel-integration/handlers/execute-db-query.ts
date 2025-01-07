import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

export const executeDBQueryHandler = {
  validate: (params: unknown): boolean => {
    return typeof (params as { sql: unknown })?.sql === 'string';
  },

  async execute(
    _kernel: Kernel,
    kvStore: KVStore,
    params: { sql: string },
  ): Promise<Json> {
    return kvStore.executeQuery(params.sql);
  },
};
