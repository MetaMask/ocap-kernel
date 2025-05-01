import { VatConfigStruct } from '@metamask/ocap-kernel';
import type { Kernel, VatConfig } from '@metamask/ocap-kernel';
import { literal } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

export const launchVatSpec: MethodSpec<
  'launchVat',
  VatConfig,
  Promise<null>
> = {
  method: 'launchVat',
  params: VatConfigStruct,
  result: literal(null),
};

export type LaunchVatHooks = {
  kernel: Pick<Kernel, 'launchVat'>;
};

export const launchVatHandler: Handler<
  'launchVat',
  VatConfig,
  Promise<null>,
  LaunchVatHooks
> = {
  ...launchVatSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<null> => {
    await kernel.launchVat(params);
    return null;
  },
};
