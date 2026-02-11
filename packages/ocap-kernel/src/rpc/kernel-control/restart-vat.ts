import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { VatId } from '../../types.ts';
import { VatIdStruct } from '../../types.ts';

export const restartVatSpec: MethodSpec<
  'restartVat',
  { id: VatId },
  Promise<null>
> = {
  method: 'restartVat',
  params: object({ id: VatIdStruct }),
  result: literal(null),
};

export type RestartVatHooks = { kernel: Pick<Kernel, 'restartVat'> };

export const restartVatHandler: Handler<
  'restartVat',
  { id: VatId },
  Promise<null>,
  RestartVatHooks
> = {
  ...restartVatSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: RestartVatHooks,
    params: { id: VatId },
  ): Promise<null> => {
    await kernel.restartVat(params.id);
    return null;
  },
};
