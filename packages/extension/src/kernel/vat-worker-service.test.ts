import '@ocap/shims/endoify';
import type { NonEmptyArray } from '@metamask/utils';
import { VatAlreadyExistsError, VatDeletedError } from '@ocap/errors';
import type { VatId, VatConfig } from '@ocap/kernel';
import { delay } from '@ocap/test-utils';
import type { MockInstance } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { VatWorker } from './vat-worker-service.js';
import type { ExtensionVatWorkerClient } from './VatWorkerClient.js';
import type { ExtensionVatWorkerServer } from './VatWorkerServer.js';
import {
  makeTestClient,
  makeTestServer,
} from '../../test/vat-worker-service.js';

// low key integration test
describe('VatWorkerService', () => {
  let serverPort: MessagePort;
  let clientPort: MessagePort;

  let server: ExtensionVatWorkerServer;
  let client: ExtensionVatWorkerClient;

  let mockWorker: VatWorker;
  let mockWorkers: NonEmptyArray<VatWorker>;

  let mockLaunchWorker: MockInstance;
  let mockTerminateWorker: MockInstance;

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    client = makeTestClient(clientPort);
    [server, ...mockWorkers] = makeTestServer({ serverPort, nWorkers: 3 });
    server.start();
  });

  it('launches and terminates a worker', async () => {
    mockWorker = mockWorkers[0];
    mockLaunchWorker = vi.spyOn(mockWorker, 'launch');
    mockTerminateWorker = vi.spyOn(mockWorker, 'terminate');

    const vatId: VatId = 'v0';
    const vatConfig: VatConfig = { sourceSpec: 'not-really-there.js' };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.launch(vatId, vatConfig);
    await delay(10);
    expect(mockLaunchWorker).toHaveBeenCalledOnce();
    expect(mockTerminateWorker).not.toHaveBeenCalled();

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.terminate(vatId);
    await delay(10);
    expect(mockLaunchWorker).toHaveBeenCalledOnce();
    expect(mockTerminateWorker).toHaveBeenCalledOnce();
  });

  it('terminates all workers', async () => {
    const mockLaunches = mockWorkers.map((worker) =>
      vi.spyOn(worker, 'launch'),
    );
    const mockTerminates = mockWorkers.map((worker) =>
      vi.spyOn(worker, 'terminate'),
    );

    // launch many workers
    for (let i = 0; i < mockWorkers.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      client.launch(`v${i}`, { sourceSpec: 'not-really-there.js' });
    }

    await delay(10);

    // each worker had its launch method called
    for (let i = 0; i < mockWorkers.length; i++) {
      expect(mockLaunches[i]).toHaveBeenCalledOnce();
      expect(mockTerminates[i]).not.toHaveBeenCalled();
    }

    // terminate all workers
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.terminateAll();
    await delay(10);

    // each worker had its terminate method called
    for (let i = 0; i < mockWorkers.length; i++) {
      expect(mockLaunches[i]).toHaveBeenCalledOnce();
      expect(mockTerminates[i]).toHaveBeenCalledOnce();
    }
  });

  it('throws when terminating a nonexistent worker', async () => {
    await expect(async () => await client.terminate('v0')).rejects.toThrow(
      VatDeletedError,
    );
  });

  it('throws when launching the same worker twice', async () => {
    const vatId: VatId = 'v0';
    const vatConfig: VatConfig = { sourceSpec: 'not-really-there.js' };
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.launch(vatId, vatConfig);
    await delay(10);
    await expect(
      async () => await client.launch(vatId, vatConfig),
    ).rejects.toThrow(VatAlreadyExistsError);
  });
});
