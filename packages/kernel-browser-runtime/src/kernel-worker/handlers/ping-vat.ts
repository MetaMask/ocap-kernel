import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import type { Kernel, VatId } from '@metamask/ocap-kernel';
import { VatIdStruct } from '@metamask/ocap-kernel';
import { vatMethodSpecs } from '@metamask/ocap-kernel/rpc';
import type { PingVatResult } from '@metamask/ocap-kernel/rpc';
import { object } from '@metamask/superstruct';

export type PingVatHooks = {
  kernel: Kernel;
};

export const pingVatSpec: MethodSpec<'pingVat', { id: VatId }, string> = {
  method: 'pingVat',
  params: object({ id: VatIdStruct }),
  result: vatMethodSpecs.ping.result,
};

export const pingVatHandler: Handler<
  'pingVat',
  { id: VatId },
  Promise<PingVatResult>,
  PingVatHooks
> = {
  ...pingVatSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<PingVatResult> => {
    return kernel.pingVat(params.id);
  },
};
