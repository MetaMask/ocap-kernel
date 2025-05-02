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
