import type { VatId } from '@ocap/kernel';
import { makeCounter } from '@ocap/utils';
import type { Logger } from '@ocap/utils';
import { vi } from 'vitest';

import type { VatWorker } from '../src/vat-worker-service.js';
import { ExtensionVatWorkerClient } from '../src/VatWorkerClient.js';
import { ExtensionVatWorkerServer } from '../src/VatWorkerServer.js';

type MakeVatWorker = (vatId: VatId) => VatWorker & { kernelPort: MessagePort };

export const getMockMakeWorker = (
  nWorkers: number = 1,
): [MakeVatWorker, ...VatWorker[]] => {
  const counter = makeCounter(-1);
  const mockWorkers = Array(nWorkers)
    .fill(0)
    .map(() => {
      const {
        // port1: vatPort,
        port2: kernelPort,
      } = new MessageChannel();
      return {
        launch: vi.fn().mockResolvedValue([kernelPort, {}]),
        terminate: vi.fn().mockResolvedValue(undefined),
        // vatPort,
        kernelPort,
      };
    });

  return [
    vi.fn().mockImplementation(() => mockWorkers[counter()]),
    ...mockWorkers,
  ];
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
