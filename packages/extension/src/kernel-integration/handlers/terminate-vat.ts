import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

export const terminateVatHandler: CommandHandler<'terminateVat'> = {
  method: 'terminateVat',
  schema: KernelCommandPayloadStructs.terminateVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kdb: KernelDatabase,
    params: CommandParams['terminateVat'],
  ): Promise<Json> => {
    await kernel.terminateVat(params.id);
    return null;
  },
};
