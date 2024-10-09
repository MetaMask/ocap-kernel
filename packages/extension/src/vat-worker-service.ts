import { isObject } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';

export enum VatWorkerServiceMethod {
  Init = 'iframe-vat-worker-init',
  Delete = 'iframe-vat-worker-delete',
}

type MessageId = number;

export type VatWorker = {
  init: () => Promise<[MessagePort, unknown]>;
  delete: () => Promise<void>;
};

export type VatWorkerServiceMessage = {
  method:
    | typeof VatWorkerServiceMethod.Init
    | typeof VatWorkerServiceMethod.Delete;
  id: MessageId;
  vatId: VatId;
  error?: Error;
};

export const isVatWorkerServiceMessage = (
  value: unknown,
): value is VatWorkerServiceMessage =>
  isObject(value) &&
  typeof value.id === 'number' &&
  Object.values(VatWorkerServiceMethod).includes(
    value.method as VatWorkerServiceMethod,
  ) &&
  typeof value.vatId === 'string';

export type PostMessage = (message: unknown, transfer?: Transferable[]) => void;
export type AddListener = (
  listener: (event: MessageEvent<unknown>) => void,
) => void;
