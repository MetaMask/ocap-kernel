import type { Handler, MethodSpec } from '@metamask/kernel-rpc-methods';
import {
  object,
  string,
  literal,
  union,
  exactOptional,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { UnsafeJsonStruct } from '@metamask/utils';
import type { Json } from '@metamask/utils';

const EvaluateParamsStruct = object({
  code: string(),
});

type EvaluateParams = Infer<typeof EvaluateParamsStruct>;

const EvaluateSuccessResultStruct = object({
  success: literal(true),
  value: exactOptional(UnsafeJsonStruct),
});

const EvaluateErrorResultStruct = object({
  success: literal(false),
  error: string(),
});

const EvaluateResultStruct = union([
  EvaluateSuccessResultStruct,
  EvaluateErrorResultStruct,
]);

export type EvaluateResult =
  | { success: true; value?: Json }
  | { success: false; error: string };

export type EvaluateSpec = MethodSpec<
  'evaluate',
  EvaluateParams,
  EvaluateResult
>;

export const evaluateSpec = {
  method: 'evaluate',
  params: EvaluateParamsStruct,
  result: EvaluateResultStruct,
} as const as EvaluateSpec;

export type HandleEvaluate = (code: string) => EvaluateResult;

type EvaluateHooks = {
  handleEvaluate: HandleEvaluate;
};

export type EvaluateHandler = Handler<
  'evaluate',
  EvaluateParams,
  EvaluateResult,
  EvaluateHooks
>;

export const evaluateHandler: EvaluateHandler = {
  ...evaluateSpec,
  hooks: { handleEvaluate: true },
  implementation: ({ handleEvaluate }, params) => handleEvaluate(params.code),
} as const;
