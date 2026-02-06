import type { Infer } from '@metamask/superstruct';

import { deliverSpec, deliverHandler } from './deliver.ts';
import type { DeliverSpec, DeliverHandler } from './deliver.ts';
import { evaluateSpec, evaluateHandler } from './evaluate.ts';
import type {
  EvaluateSpec,
  EvaluateHandler,
  EvaluateResult,
} from './evaluate.ts';
import { initVatSpec, initVatHandler } from './initVat.ts';
import type { InitVatSpec, InitVatHandler } from './initVat.ts';
import { pingSpec, pingHandler } from './ping.ts';
import type { PingSpec, PingHandler } from './ping.ts';

// The handler and spec exports are explicitly annotated due to a TS2742 error
// that occurs during CommonJS builds by ts-bridge.

export const vatHandlers = {
  deliver: deliverHandler,
  evaluate: evaluateHandler,
  initVat: initVatHandler,
  ping: pingHandler,
} as {
  deliver: DeliverHandler;
  evaluate: EvaluateHandler;
  initVat: InitVatHandler;
  ping: PingHandler;
};

export const vatMethodSpecs = {
  deliver: deliverSpec,
  evaluate: evaluateSpec,
  initVat: initVatSpec,
  ping: pingSpec,
} as {
  deliver: DeliverSpec;
  evaluate: EvaluateSpec;
  initVat: InitVatSpec;
  ping: PingSpec;
};

type Handlers = (typeof vatHandlers)[keyof typeof vatHandlers];

export type VatMethod = Handlers['method'];

export type PingVatResult = Infer<PingSpec['result']>;

export type { EvaluateResult };
