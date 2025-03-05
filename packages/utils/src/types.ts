import type { Primitive } from '@endo/captp';
import type { PromiseKit } from '@endo/promise-kit';
import { isObject } from '@metamask/utils';

export type TypeGuard<Type> = (value: unknown) => value is Type;

export type ExtractGuardType<Guard, Bound = unknown> = Guard extends (
  value: unknown,
) => value is infer Type
  ? Type extends Bound
    ? Type
    : never
  : never;

const primitives = new Set([
  'string',
  'number',
  'bigint',
  'boolean',
  'symbol',
  'null',
  'undefined',
]);
export const isPrimitive = (value: unknown): value is Primitive =>
  value === null || primitives.has(typeof value);

export const isTypedArray = <ElementType>(
  value: unknown,
  isElement: TypeGuard<ElementType>,
): value is ElementType[] =>
  Array.isArray(value) && !value.some((ele) => !isElement(ele));

export const isTypedObject = <ValueType>(
  value: unknown,
  isValue: TypeGuard<ValueType>,
): value is { [Key in keyof object]: ValueType } =>
  isObject(value) && !Object.values(value).some((val) => !isValue(val));

export type PromiseCallbacks<Resolve = unknown> = Omit<
  PromiseKit<Resolve>,
  'promise'
>;
