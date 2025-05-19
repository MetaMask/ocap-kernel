import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { VatIdStruct } from '@metamask/ocap-kernel';
import type { Kernel, VatId } from '@metamask/ocap-kernel';
import { object, literal } from '@metamask/superstruct';

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
