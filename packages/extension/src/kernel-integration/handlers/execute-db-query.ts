import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

export const executeDBQueryHandler: CommandHandler<'executeDBQuery'> = {
  method: 'executeDBQuery',
  schema: KernelCommandPayloadStructs.executeDBQuery.schema.params,
  implementation: async (
    _kernel: Kernel,
    kdb: KernelDatabase,
    params: CommandParams['executeDBQuery'],
  ): Promise<Json> => {
    return kdb.executeQuery(params.sql);
  },
};
