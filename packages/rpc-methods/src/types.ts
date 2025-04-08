import type { Infer, Struct } from '@metamask/superstruct';
import type { JsonRpcParams, Json } from '@metamask/utils';

// Client-side types

export type MethodSignature<
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
> = (method: Method, params: Params) => Promise<Result>;

export type MethodSpec<
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  method: Method;
  params: Struct<Params>;
  result: Struct<Result>;
};

// `any` can safely be used in constraints.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpecConstraint = MethodSpec<string, any, any>;

export type MethodSpecRecord<Methods extends SpecConstraint> = Record<
  Methods['method'],
  Methods
>;

type SpecRecordConstraint = MethodSpecRecord<SpecConstraint>;

export type ExtractMethodSignature<Spec extends SpecConstraint> = Spec extends (
  method: infer Method extends string,
  params: infer Params extends JsonRpcParams,
) => Promise<infer Result extends Json>
  ? MethodSignature<Method, Params, Result>
  : never;

export type ExtractMethodSpec<
  Specs extends SpecRecordConstraint,
  Key extends keyof Specs = keyof Specs,
> = Specs[Key];

export type ExtractMethod<Specs extends SpecRecordConstraint> =
  ExtractMethodSpec<Specs>['method'];

export type ExtractParams<
  Method extends string,
  Specs extends SpecRecordConstraint,
> = Infer<ExtractMethodSpec<Specs, Method>['params']>;

export type ExtractResult<
  Method extends string,
  Specs extends SpecRecordConstraint,
> = Infer<ExtractMethodSpec<Specs, Method>['result']>;

export type HandlerFunction<
  Params extends JsonRpcParams,
  Result extends Json,
  Hooks extends Record<string, unknown>,
> = (hooks: Hooks, params: Params) => Promise<Result>;

// Service-side types

export type Handler<
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
  Hooks extends Record<string, unknown>,
> = MethodSpec<Method, Params, Result> & {
  hooks: { [Key in keyof Hooks]: true };
  implementation: HandlerFunction<Params, Result, Hooks>;
};
