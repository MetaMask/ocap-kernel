import { object, literal } from '@metamask/superstruct';
import type { Kernel, VatId } from '@ocap/kernel';
import { VatIdStruct } from '@ocap/kernel';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

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
