import { launchHandler, launchSpec } from './launch.ts';
import { terminateHandler, terminateSpec } from './terminate.ts';
import { terminateAllHandler, terminateAllSpec } from './terminateAll.ts';

export const handlers = {
  launch: launchHandler,
  terminate: terminateHandler,
  terminateAll: terminateAllHandler,
} as const;

export const methodSpecs = {
  launch: launchSpec,
  terminate: terminateSpec,
  terminateAll: terminateAllSpec,
} as const;

type Handlers = (typeof handlers)[keyof typeof handlers];

export type VatWorkerServiceMethod = Handlers['method'];
