import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import type { Kernel, VatId } from '@metamask/ocap-kernel';
import { VatIdStruct } from '@metamask/ocap-kernel';
import { vatMethodSpecs } from '@metamask/ocap-kernel/rpc';
import type { EvaluateResult } from '@metamask/ocap-kernel/rpc';
import { object, string } from '@metamask/superstruct';

export type EvaluateVatHooks = {
  kernel: Kernel;
};

type EvaluateVatParams = { id: VatId; code: string };

export type EvaluateVatSpec = MethodSpec<
  'evaluateVat',
  EvaluateVatParams,
  EvaluateResult
>;

export const evaluateVatSpec = {
  method: 'evaluateVat',
  params: object({ id: VatIdStruct, code: string() }),
  result: vatMethodSpecs.evaluate.result,
} as const as EvaluateVatSpec;

export type EvaluateVatHandler = Handler<
  'evaluateVat',
  EvaluateVatParams,
  Promise<EvaluateResult>,
  EvaluateVatHooks
>;

export const evaluateVatHandler: EvaluateVatHandler = {
  ...evaluateVatSpec,
  hooks: { kernel: true },
  implementation: async ({ kernel }, params): Promise<EvaluateResult> => {
    return kernel.evaluateVat(params.id, params.code);
  },
} as const as EvaluateVatHandler;
