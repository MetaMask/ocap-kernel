import type { MethodSpec, Handler } from '@metamask/kernel-rpc-methods';
import { array, object, string, tuple } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import { VatDeliveryResultStruct } from './shared.ts';
import { VatConfigStruct } from '../../types.ts';
import type { VatConfig, VatDeliveryResult } from '../../types.ts';

const paramsStruct = object({
  vatConfig: VatConfigStruct,
  state: array(tuple([string(), string()])),
});

type Params = Infer<typeof paramsStruct>;

export type InitVatSpec = MethodSpec<
  'initVat',
  Params,
  Promise<VatDeliveryResult>
>;

export const initVatSpec: InitVatSpec = {
  method: 'initVat',
  params: paramsStruct,
  result: VatDeliveryResultStruct,
};

export type InitVat = (
  vatConfig: VatConfig,
  state: Map<string, string>,
) => Promise<VatDeliveryResult>;

type InitVatHooks = {
  initVat: InitVat;
};

export type InitVatHandler = Handler<
  'initVat',
  Params,
  Promise<VatDeliveryResult>,
  InitVatHooks
>;

export const initVatHandler: InitVatHandler = {
  ...initVatSpec,
  hooks: { initVat: true },
  implementation: async ({ initVat }, params) => {
    return await initVat(params.vatConfig, new Map(params.state));
  },
};
