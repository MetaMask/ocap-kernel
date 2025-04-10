import type { MethodSpecRecord } from '@ocap/rpc-methods';

import { launchSpec } from './launch.ts';
import { terminateSpec } from './terminate.ts';
import { terminateAllSpec } from './terminateAll.ts';

// This module only has method specifications and no handlers, because the method
// implementations are highly platform-specific and do not warrant standalone
// implementations.

export type VatWorkerServiceMethodSpecs =
  | typeof launchSpec
  | typeof terminateSpec
  | typeof terminateAllSpec;

export const methodSpecs: MethodSpecRecord<VatWorkerServiceMethodSpecs> = {
  launch: launchSpec,
  terminate: terminateSpec,
  terminateAll: terminateAllSpec,
} as const;

export type VatWorkerServiceMethod = VatWorkerServiceMethodSpecs['method'];
