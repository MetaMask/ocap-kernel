import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { VatConfigStruct } from '@metamask/ocap-kernel';
import type { Kernel, SubclusterId, VatConfig } from '@metamask/ocap-kernel';
import { exactOptional, literal, object, string } from '@metamask/superstruct';

export type LaunchVatParams = {
  config: VatConfig;
  subclusterId?: SubclusterId;
};

export const launchVatSpec: MethodSpec<
  'launchVat',
  LaunchVatParams,
  Promise<null>
> = {
  method: 'launchVat',
  params: object({
    config: VatConfigStruct,
    subclusterId: exactOptional(string()),
  }),
  result: literal(null),
};

export type LaunchVatHooks = {
  kernel: Pick<Kernel, 'launchVat'>;
};

export const launchVatHandler: Handler<
  'launchVat',
  LaunchVatParams,
  Promise<null>,
  LaunchVatHooks
> = {
  ...launchVatSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<null> => {
    await kernel.launchVat(params.config, params.subclusterId);
    return null;
  },
};
