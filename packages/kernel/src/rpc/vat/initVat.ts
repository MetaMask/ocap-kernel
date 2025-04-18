import { object, record, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type { MethodSpec, Handler } from '@ocap/rpc-methods';

import { VatCheckpointStruct, VatConfigStruct } from '../../types.ts';
import type { VatCheckpoint, VatConfig } from '../../types.ts';

const paramsStruct = object({
  vatConfig: VatConfigStruct,
  state: record(string(), string()),
});

type Params = Infer<typeof paramsStruct>;

export type InitVatSpec = MethodSpec<'initVat', Params, Promise<VatCheckpoint>>;

export const initVatSpec: InitVatSpec = {
  method: 'initVat',
  params: paramsStruct,
  result: VatCheckpointStruct,
};

export type InitVat = (
  vatConfig: VatConfig,
  state: Map<string, string>,
) => Promise<VatCheckpoint>;

type InitVatHooks = {
  initVat: InitVat;
};

export type InitVatHandler = Handler<
  'initVat',
  Params,
  Promise<VatCheckpoint>,
  InitVatHooks
>;

export const initVatHandler: InitVatHandler = {
  ...initVatSpec,
  hooks: { initVat: true },
  implementation: async ({ initVat }, params) => {
    return await initVat(
      params.vatConfig,
      new Map(Object.entries(params.state)),
    );
  },
};
