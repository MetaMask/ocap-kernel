import { literal } from '@metamask/superstruct';
import { VatConfigStruct } from '@ocap/kernel';
import type { Kernel, VatConfig } from '@ocap/kernel';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

export const launchVatSpec: MethodSpec<'launchVat', VatConfig, null> = {
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
  null,
  LaunchVatHooks
> = {
  ...launchVatSpec,
  hooks: { kernel: true },
  implementation: async (
    { kernel }: LaunchVatHooks,
    params: VatConfig,
  ): Promise<null> => {
    await kernel.launchVat(params);
    return null;
  },
};
