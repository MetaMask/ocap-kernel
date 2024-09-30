import type { Primitive } from '@endo/captp';
import { isObject } from '@metamask/utils';

export type TypeGuard<Type> = (value: unknown) => value is Type;

const primitives = [
  'string',
  'number',
  'bigint',
  'boolean',
  'symbol',
  'null',
  'undefined',
];
export const isPrimitive = (value: unknown): value is Primitive =>
  value === null || primitives.includes(typeof value);

export const isTypedArray = <ElementType>(
  value: unknown,
  isElement: TypeGuard<ElementType>,
): value is ElementType[] => Array.isArray(value) && value.every(isElement);

export const isTypedObject = <ValueType>(
  value: unknown,
  isValue: TypeGuard<ValueType>,
): value is { [Key in keyof object]: ValueType } =>
  isObject(value) && Object.values(value).every(isValue);
