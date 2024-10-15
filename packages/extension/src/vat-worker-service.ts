import { isObject } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';

export enum VatWorkerServiceMethod {
  Launch = 'iframe-vat-worker-launch',
  Terminate = 'iframe-vat-worker-terminate',
}

type MessageId = number;

export type VatWorker = {
  launch: () => Promise<[MessagePort, unknown]>;
  terminate: () => Promise<void>;
};

export type VatWorkerServiceMessage = {
  method:
    | typeof VatWorkerServiceMethod.Launch
    | typeof VatWorkerServiceMethod.Terminate;
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
