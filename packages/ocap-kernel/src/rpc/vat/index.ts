import { is, refine, Struct } from '@metamask/superstruct';
import { JsonRpcRequestStruct } from '@metamask/utils';
import type { MethodRequest } from '@ocap/rpc-methods';

import { deliverSpec, deliverHandler } from './deliver.ts';
import type { DeliverSpec, DeliverHandler } from './deliver.ts';
import { initVatSpec, initVatHandler } from './initVat.ts';
import type { InitVatSpec, InitVatHandler } from './initVat.ts';
import { pingSpec, pingHandler } from './ping.ts';
import type { PingSpec, PingHandler } from './ping.ts';

// The handler and spec exports are explicitly annotated due to a TS2742 error
// that occurs during CommonJS builds by ts-bridge.

export const vatHandlers = {
  deliver: deliverHandler,
  initVat: initVatHandler,
  ping: pingHandler,
} as {
  deliver: DeliverHandler;
  initVat: InitVatHandler;
  ping: PingHandler;
};

export const vatMethodSpecs = {
  deliver: deliverSpec,
  initVat: initVatSpec,
  ping: pingSpec,
} as {
  deliver: DeliverSpec;
  initVat: InitVatSpec;
  ping: PingSpec;
};

type Handlers = (typeof vatHandlers)[keyof typeof vatHandlers];

export type VatMethod = Handlers['method'];

export type VatUiMethod =
  | (typeof vatMethodSpecs)['deliver']
  | (typeof vatMethodSpecs)['ping'];

export type UiMethodRequest = MethodRequest<VatUiMethod>;

export const UiMethodRequestStruct = refine(
  JsonRpcRequestStruct,
  'UiMethodRequest',
  (value) => {
    return (
      (value.method === 'ping' && is(value.params, pingSpec.params)) ||
      (value.method === 'deliver' && is(value.params, deliverSpec.params))
    );
  },
) as Struct<UiMethodRequest>;
