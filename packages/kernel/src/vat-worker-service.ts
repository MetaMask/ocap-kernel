// Vat worker service.

import { isObject } from '@metamask/utils';

import type { VatId } from './types.js';

export const SERVICE_TYPE_CREATE = 'iframe-vat-worker-create';
export const SERVICE_TYPE_DELETE = 'iframe-vat-worker-delete';

type MessageId = number;

export type VatWorker = {
  init: () => Promise<[MessagePort, unknown]>;
  delete: () => Promise<void>;
};

export type VatWorkerServiceMessage = {
  method: typeof SERVICE_TYPE_CREATE | typeof SERVICE_TYPE_DELETE;
  id: MessageId;
  vatId: VatId;
  error?: Error;
};

export const isVatWorkerServiceMessage = (
  value: unknown,
): value is VatWorkerServiceMessage =>
  isObject(value) &&
  typeof value.id === 'number' &&
  (value.method === SERVICE_TYPE_CREATE ||
    value.method === SERVICE_TYPE_DELETE) &&
  typeof value.vatId === 'string';

export type PostMessage = (message: unknown, transfer?: Transferable[]) => void;
export type AddListener = (
  listener: (event: MessageEvent<unknown>) => void,
) => void;
