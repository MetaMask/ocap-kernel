import type { Primitive } from '@endo/captp';
import type { PromiseKit } from '@endo/promise-kit';
import type { Infer, Struct } from '@metamask/superstruct';
import { array, empty, is, union } from '@metamask/superstruct';
import {
  isObject,
  UnsafeJsonStruct,
  JsonRpcRequestStruct,
  JsonRpcResponseStruct,
  JsonRpcNotificationStruct,
} from '@metamask/utils';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

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

export const EmptyJsonArray = empty(array(UnsafeJsonStruct));

export type EmptyJsonArray = Infer<typeof EmptyJsonArray>;

export type JsonRpcCall = JsonRpcRequest | JsonRpcNotification;

export const JsonRpcCallStruct: Struct<JsonRpcCall> = union([
  JsonRpcRequestStruct,
  JsonRpcNotificationStruct,
]);

export const isJsonRpcCall = (value: unknown): value is JsonRpcCall =>
  is(value, JsonRpcCallStruct);

export type JsonRpcMessage =
  | JsonRpcNotification
  | JsonRpcRequest
  | JsonRpcResponse;

export const JsonRpcMessageStruct: Struct<JsonRpcMessage> = union([
  JsonRpcNotificationStruct,
  JsonRpcRequestStruct,
  JsonRpcResponseStruct,
]);

export const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage =>
  is(value, JsonRpcMessageStruct);

export type ModuleRecord = {
  imports: string[];
  exports: string[];
  execute: (moduleExports: Record<string, unknown>) => void;
};

export type ImportHook = (specifier: string) => ModuleRecord | undefined;
