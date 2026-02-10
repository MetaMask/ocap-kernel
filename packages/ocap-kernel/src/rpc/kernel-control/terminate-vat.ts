import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { object, literal } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { VatId } from '../../types.ts';
import { VatIdStruct } from '../../types.ts';

export const terminateVatSpec: MethodSpec<
  'terminateVat',
  { id: VatId },
  Promise<null>
> = {
  method: 'terminateVat',
  params: object({ id: VatIdStruct }),
  result: literal(null),
};

export type TerminateVatHooks = { kernel: Pick<Kernel, 'terminateVat'> };

export const terminateVatHandler: Handler<
  'terminateVat',
  { id: VatId },
  Promise<null>,
  TerminateVatHooks
> = {
  ...terminateVatSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<null> => {
    await kernel.terminateVat(params.id);
    return null;
  },
};
