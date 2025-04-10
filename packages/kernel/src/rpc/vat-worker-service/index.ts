import type { HandlerRecord, MethodSpecRecord } from '@ocap/rpc-methods';

import { launchHandler, launchSpec } from './launch.ts';
import { terminateHandler, terminateSpec } from './terminate.ts';
import { terminateAllHandler, terminateAllSpec } from './terminateAll.ts';

type Handlers =
  | typeof launchHandler
  | typeof terminateHandler
  | typeof terminateAllHandler;

export type VatWorkerServiceMethod = Handlers['method'];

export const handlers: HandlerRecord<Handlers> = {
  launch: launchHandler,
  terminate: terminateHandler,
  terminateAll: terminateAllHandler,
} as const;

export type VatWorkerServiceMethodSpecs =
  | typeof launchSpec
  | typeof terminateSpec
  | typeof terminateAllSpec;

export const methodSpecs: MethodSpecRecord<VatWorkerServiceMethodSpecs> = {
  launch: launchSpec,
  terminate: terminateSpec,
  terminateAll: terminateAllSpec,
} as const;
