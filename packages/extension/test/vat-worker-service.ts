import type { VatId } from '@ocap/kernel';
import type { Logger } from '@ocap/utils';
import { vi } from 'vitest';

import type { VatWorker } from '../src/vat-worker-service.js';
import { ExtensionVatWorkerClient } from '../src/VatWorkerClient.js';
import { ExtensionVatWorkerServer } from '../src/VatWorkerServer.js';

type MakeVatWorker = (vatId: VatId) => VatWorker;

export const getMockMakeWorker = (
  kernelPort: MessagePort,
): [VatWorker, MakeVatWorker] => {
  const mockWorker = {
    init: vi.fn().mockResolvedValue([kernelPort, {}]),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  return [mockWorker, vi.fn().mockReturnValue(mockWorker)];
};

export const makeTestClient = (
  port: MessagePort,
  logger?: Logger,
): ExtensionVatWorkerClient =>
  new ExtensionVatWorkerClient(
    (message: unknown) => port.postMessage(message),
    (listener) => {
      port.onmessage = listener;
    },
    logger,
  );

type MakeTestServerArgs = {
  serverPort: MessagePort;
  logger?: Logger;
} & (
  | {
      makeWorker: MakeVatWorker;
      kernelPort?: never;
    }
  | {
      makeWorker?: never;
      kernelPort: MessagePort;
    }
);

export const makeTestServer = (
  args: MakeTestServerArgs,
): ExtensionVatWorkerServer =>
  new ExtensionVatWorkerServer(
    (message: unknown, transfer?: Transferable[]) =>
      transfer
        ? args.serverPort.postMessage(message, transfer)
        : args.serverPort.postMessage(message),
    (listener) => {
      args.serverPort.onmessage = listener;
    },
    args.makeWorker ?? getMockMakeWorker(args.kernelPort)[1],
    args.logger,
  );
