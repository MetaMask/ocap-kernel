import { isObject } from '@metamask/utils';

import type { CapTpMessage, WrappedVatMessage } from './types.ts';

export const isWrappedVatMessage = (
  value: unknown,
): value is WrappedVatMessage =>
  isObject(value) &&
  typeof value.id === 'string' &&
  isObject(value.message) &&
  typeof value.message.type === 'string' &&
  (typeof value.message.data === 'string' || value.message.data === null);

export const isCapTpMessage = (value: unknown): value is CapTpMessage =>
  isObject(value) &&
  typeof value.type === 'string' &&
  value.type.startsWith('CTP_') &&
  typeof value.epoch === 'number';
