import type { Json } from '@metamask/utils';
import { isVatConfig } from '@ocap/kernel';
import type { Kernel, KVStore, VatConfig } from '@ocap/kernel';

export const launchVatHandler = {
  validate: (params: unknown): boolean => {
    return isVatConfig(params);
  },

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: VatConfig,
  ): Promise<Json> {
    await kernel.launchVat(params);
    return null;
  },
};
