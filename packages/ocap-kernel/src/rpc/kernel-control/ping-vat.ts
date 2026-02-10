import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import { object } from '@metamask/superstruct';

import type { Kernel } from '../../Kernel.ts';
import type { VatId } from '../../types.ts';
import { VatIdStruct } from '../../types.ts';
import { vatMethodSpecs } from '../vat/index.ts';
import type { PingVatResult } from '../vat/index.ts';

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
