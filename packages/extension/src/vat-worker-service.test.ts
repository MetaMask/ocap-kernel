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
  let mockInitWorker: MockInstance;
  let mockDeleteWorker: MockInstance;

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    const deliveredMessageChannel = new MessageChannel();
    // vatPort = deliveredMessageChannel.port1;
    kernelPort = deliveredMessageChannel.port2;

    [mockWorker, mockMakeWorker] = getMockMakeWorker(kernelPort);

    mockInitWorker = vi.spyOn(mockWorker, 'init');
    mockDeleteWorker = vi.spyOn(mockWorker, 'delete');
  });

  // low key integration test
  describe('Service', () => {
    beforeEach(() => {
      client = makeTestClient(clientPort);
      server = makeTestServer({ serverPort, makeWorker: mockMakeWorker });
      server.start();
    });

    it('initializes and deletes a worker', async () => {
      const vatId: VatId = 'v0';
      const stream = await client.initWorker(vatId);
      expect(stream).toBeInstanceOf(MessagePortDuplexStream);
      expect(mockInitWorker).toHaveBeenCalledOnce();
      expect(mockDeleteWorker).not.toHaveBeenCalled();

      await client.deleteWorker(vatId);
      expect(mockInitWorker).toHaveBeenCalledOnce();
      expect(mockDeleteWorker).toHaveBeenCalledOnce();
    });

    it('throws when deleting a nonexistent worker', async () => {
      await expect(async () => await client.deleteWorker('v0')).rejects.toThrow(
        /vat v0 does not exist/u,
      );
    });

    it('throws when initializing the same worker twice', async () => {
      const vatId: VatId = 'v0';
      await client.initWorker(vatId);
      await expect(async () => await client.initWorker(vatId)).rejects.toThrow(
        /vat v0 already exists/u,
      );
    });
  });
});
