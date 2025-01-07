import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';

export const getStatusHandler = {
  validate: (params: unknown): boolean => {
    return params === null;
  },

  async execute(kernel: Kernel): Promise<Json> {
    return {
      vats: kernel.getVats(),
    };
  },
};
