import { hasProperty, isObject } from '@metamask/utils';

import type { VatId } from '../types.js';
import { isVatId } from '../types.js';

export type VatMessageId = `${VatId}:${number}`;

export const isVatMessageId = (value: unknown): value is VatMessageId => {
  if (typeof value !== 'string') {
    return false;
  }
  const parts = value.split(':');
  return (
    parts.length === 2 &&
    isVatId(parts[0]) &&
    parts[1] === String(Number(parts[1]))
  );
};

export type VatMessage<Payload> = { id: VatMessageId; payload: Payload };

export const isVatMessage = (value: unknown): value is VatMessage<unknown> =>
  isObject(value) && isVatMessageId(value.id) && hasProperty(value, 'payload');
