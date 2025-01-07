import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

export const clearStateHandler = {
  validate: (params: unknown): boolean => {
    return params === null;
  },

  async execute(kernel: Kernel): Promise<Json> {
    await kernel.reset();
    return null;
  },
};
