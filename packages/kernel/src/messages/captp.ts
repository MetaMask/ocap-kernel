import type { Json } from '@metamask/utils';
import { isObject } from '@metamask/utils';

export type CapTpPayload = {
  method: string;
  params: Json[];
};

export const isCapTpPayload = (value: unknown): value is CapTpPayload =>
  isObject(value) &&
  typeof value.method === 'string' &&
  Array.isArray(value.params);

export type CapTpMessage<Type extends `CTP_${string}` = `CTP_${string}`> = {
  type: Type;
  epoch: number;
  [key: string]: Json;
};

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
