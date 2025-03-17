import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';

import type { CommandHandler, CommandParams } from '../command-registry.ts';
import { KernelCommandPayloadStructs } from '../messages.ts';

export const launchVatHandler: CommandHandler<'launchVat'> = {
  method: 'launchVat',
  schema: KernelCommandPayloadStructs.launchVat.schema.params,
  implementation: async (
    kernel: Kernel,
    _kdb: KernelDatabase,
    params: CommandParams['launchVat'],
  ): Promise<Json> => {
    await kernel.launchVat(params);
    return null;
  },
};
