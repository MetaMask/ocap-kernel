import type { NonEmptyArray } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';
import { makeCounter } from '@ocap/utils';
import type { Logger } from '@ocap/utils';
import { vi } from 'vitest';

import type { VatWorker } from '../src/kernel/vat-worker-service.js';
import { ExtensionVatWorkerClient } from '../src/kernel/VatWorkerClient.js';
import { ExtensionVatWorkerServer } from '../src/kernel/VatWorkerServer.js';

const getMockMakeWorker = (
  nWorkers: number = 1,
): [
  (vatId: VatId) => VatWorker & { kernelPort: MessagePort },
  ...NonEmptyArray<VatWorker>,
] => {
  if (typeof nWorkers !== 'number' || nWorkers < 1) {
    throw new Error('invalid argument: nWorkers must be > 0');
  }
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
    }) as unknown as NonEmptyArray<VatWorker>;

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

export const makeTestServer = (args: {
  serverPort: MessagePort;
  logger?: Logger;
  nWorkers?: number;
}): [ExtensionVatWorkerServer, ...NonEmptyArray<VatWorker>] => {
  const [makeWorker, ...workers] = getMockMakeWorker(args.nWorkers);
  return [
    new ExtensionVatWorkerServer(
      (message: unknown, transfer?: Transferable[]) =>
        transfer
          ? args.serverPort.postMessage(message, transfer)
          : args.serverPort.postMessage(message),
      (listener) => {
        args.serverPort.onmessage = listener;
      },
      makeWorker,
      args.logger,
    ),
    ...workers,
  ];
};
