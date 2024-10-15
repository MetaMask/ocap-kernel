import '@ocap/shims/endoify';
import type { VatId } from '@ocap/kernel';
import { MessagePortDuplexStream } from '@ocap/streams';
import type { MockInstance } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { VatWorker } from './vat-worker-service.js';
import type { ExtensionVatWorkerClient } from './VatWorkerClient.js';
import type { ExtensionVatWorkerServer } from './VatWorkerServer.js';
import {
  getMockMakeWorker,
  makeTestClient,
  makeTestServer,
} from '../test/vat-worker-service.js';

describe('VatWorker', () => {
  let serverPort: MessagePort;
  let clientPort: MessagePort;

  let server: ExtensionVatWorkerServer;
  let client: ExtensionVatWorkerClient;

  // let vatPort: MessagePort;
  let kernelPort: MessagePort;

  let mockWorker: VatWorker;

  let mockMakeWorker: (vatId: VatId) => VatWorker;
  let mockLaunchWorker: MockInstance;
  let mockTerminateWorker: MockInstance;

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    const deliveredMessageChannel = new MessageChannel();
    // vatPort = deliveredMessageChannel.port1;
    kernelPort = deliveredMessageChannel.port2;

    [mockWorker, mockMakeWorker] = getMockMakeWorker(kernelPort);

    mockLaunchWorker = vi.spyOn(mockWorker, 'launch');
    mockTerminateWorker = vi.spyOn(mockWorker, 'terminate');
  });

  // low key integration test
  describe('Service', () => {
    beforeEach(() => {
      client = makeTestClient(clientPort);
      server = makeTestServer({ serverPort, makeWorker: mockMakeWorker });
      server.start();
    });

    it('launches and terminates a worker', async () => {
      const vatId: VatId = 'v0';
      const stream = await client.launch(vatId);
      expect(stream).toBeInstanceOf(MessagePortDuplexStream);
      expect(mockLaunchWorker).toHaveBeenCalledOnce();
      expect(mockTerminateWorker).not.toHaveBeenCalled();

      await client.terminate(vatId);
      expect(mockLaunchWorker).toHaveBeenCalledOnce();
      expect(mockTerminateWorker).toHaveBeenCalledOnce();
    });

    it('throws when terminating a nonexistent worker', async () => {
      await expect(async () => await client.terminate('v0')).rejects.toThrow(
        /vat v0 does not exist/u,
      );
    });

    it('throws when launching the same worker twice', async () => {
      const vatId: VatId = 'v0';
      await client.launch(vatId);
      await expect(async () => await client.launch(vatId)).rejects.toThrow(
        /vat v0 already exists/u,
      );
    });
  });
});
