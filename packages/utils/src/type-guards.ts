import { isObject } from '@metamask/utils';

import type {
  Command,
  CapTpMessage,
  VatMessage,
  CapTpPayload,
} from './types.js';

export const isCapTpPayload = (value: unknown): value is CapTpPayload =>
  isObject(value) &&
  typeof value.method === 'string' &&
  Array.isArray(value.params);

export const isCommand = (value: unknown): value is Command =>
  isObject(value) &&
  typeof value.method === 'string' &&
  (typeof value.params === 'string' ||
    value.params === null ||
    isCapTpPayload(value.params));

export const isVatMessage = (value: unknown): value is VatMessage =>
  isObject(value) && typeof value.id === 'string' && isCommand(value.payload);

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
