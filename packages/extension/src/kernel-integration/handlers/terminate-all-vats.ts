import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

export const terminateAllVatsHandler = {
  validate: (params: unknown): boolean => {
    return params === null;
  },

  async execute(kernel: Kernel): Promise<Json> {
    await kernel.terminateAllVats();
    return null;
  },
};
