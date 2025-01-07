import type { Json } from '@metamask/utils';
import { isVatId } from '@ocap/kernel';
import type { Kernel, KVStore, VatId } from '@ocap/kernel';

export const restartVatHandler = {
  validate: (params: unknown): boolean => {
    return isVatId((params as { id: unknown })?.id);
  },

  async execute(
    kernel: Kernel,
    _kvStore: KVStore,
    params: { id: VatId },
  ): Promise<Json> {
    await kernel.restartVat(params.id);
    return null;
  },
};
