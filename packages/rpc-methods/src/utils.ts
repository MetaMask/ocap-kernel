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

export type PartialHandler<
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
  Hooks extends Record<string, unknown>,
> = {
  method: Method;
  hooks: { [Key in keyof Hooks]: true };
  implementation: HandlerFunction<Params, Result, Hooks>;
};

export type Handler<
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
  Hooks extends Record<string, unknown>,
> = PartialHandler<Method, Params, Result, Hooks> &
  MethodSpec<Method, Params, Result>;

// Utility functions

/**
 * Merge two `Record<string, Record<string, unknown>>` values, where the top-level keys are the same,
 * and the second record's values will override the first record's values.
 *
 * Useful for merging {@link MethodSpec} and {@link PartialHandler} records.
 *
 * @param first - The first record.
 * @param second - The second record.
 * @returns A new record with the second record's values overriding the first record's values.
 */
export const mergeRecords = <
  First extends Record<string, Record<string, unknown>>,
  Second extends Record<keyof First, Record<string, unknown>>,
>(
  first: First,
  second: Second,
): First & Second => {
  return Object.keys(second).reduce(
    (acc, key) => {
      const typedKey = key as keyof First;
      acc[typedKey] = {
        ...first[typedKey],
        ...second[typedKey],
      } as (First & Second)[keyof First];
      return acc;
    },
    {} as First & Second,
  );
};
