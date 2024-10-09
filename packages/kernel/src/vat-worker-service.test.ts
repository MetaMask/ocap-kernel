import '@ocap/shims/endoify';
import { MessagePortDuplexStream } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import type { MockInstance } from 'vitest';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { VatId } from './types.js';
import type { VatWorker } from './vat-worker-service.js';
import {
  SERVICE_TYPE_CREATE,
  SERVICE_TYPE_DELETE,
  VatWorkerClient,
  VatWorkerServer,
} from './vat-worker-service.js';

describe('VatWorker', () => {
  let serverPort: MessagePort;
  let clientPort: MessagePort;

  let serverLogger: Logger;
  let clientLogger: Logger;

  let server: VatWorkerServer;
  let client: VatWorkerClient;

  // let vatPort: MessagePort;
  let userPort: MessagePort;

  let mockWorker: VatWorker;

  let mockMakeWorker: (vatId: VatId) => VatWorker;
  let mockInitWorker: MockInstance;
  let mockDeleteWorker: MockInstance;

  const makeServer = (port: MessagePort, logger?: Logger): VatWorkerServer =>
    new VatWorkerServer(
      (message: unknown, transfer?: Transferable[]) =>
        transfer
          ? port.postMessage(message, transfer)
          : port.postMessage(message),
      (listener) => {
        port.onmessage = listener;
      },
      mockMakeWorker,
      logger,
    );

  const makeClient = (port: MessagePort, logger?: Logger): VatWorkerClient =>
    new VatWorkerClient(
      (message: unknown) => port.postMessage(message),
      (listener) => {
        port.onmessage = listener;
      },
      logger,
    );

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    serverLogger = makeLogger('[test server]');
    clientLogger = makeLogger('[test client]');

    const deliveredMessageChannel = new MessageChannel();
    // vatPort = deliveredMessageChannel.port1;
    userPort = deliveredMessageChannel.port2;

    mockWorker = {
      init: vi.fn().mockResolvedValue([userPort, {}]),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    mockMakeWorker = vi.fn().mockReturnValue(mockWorker);
    mockInitWorker = vi.spyOn(mockWorker, 'init');
    mockDeleteWorker = vi.spyOn(mockWorker, 'delete');
  });

  describe('Server', () => {
    beforeEach(() => {
      server = makeServer(serverPort, serverLogger);
    });

    it('starts', () => {
      server.start();
      expect(serverPort.onmessage).toBeDefined();
    });

    it('throws if started twice', () => {
      server.start();
      expect(() => server.start()).toThrow(/already running/u);
    });

    it('calls logger.debug when receiving an unexpected message', async () => {
      const debugSpy = vi.spyOn(serverLogger, 'debug');
      const unexpectedMessage = 'foobar';
      server.start();
      clientPort.postMessage(unexpectedMessage);
      await delay(100);
      expect(debugSpy).toHaveBeenCalledOnce();
      expect(debugSpy).toHaveBeenLastCalledWith(
        'Received unexpected message',
        unexpectedMessage,
      );
    });
  });

  describe('Client', () => {
    beforeEach(() => {
      client = makeClient(clientPort, clientLogger);
    });

    it('calls logger.debug when receiving an unexpected message', async () => {
      const debugSpy = vi.spyOn(clientLogger, 'debug');
      const unexpectedMessage = 'foobar';
      serverPort.postMessage(unexpectedMessage);
      await delay(100);
      expect(debugSpy).toHaveBeenCalledOnce();
      expect(debugSpy).toHaveBeenLastCalledWith(
        'Received unexpected message',
        unexpectedMessage,
      );
    });

    it.each`
      method
      ${SERVICE_TYPE_CREATE}
      ${SERVICE_TYPE_DELETE}
    `(
      "calls logger.error when receiving a $method reply it wasn't waiting for",
      async ({ method }) => {
        const errorSpy = vi.spyOn(clientLogger, 'error');
        const unexpectedReply = {
          method,
          id: 9,
          vatId: 'v0',
        };
        serverPort.postMessage(unexpectedReply);
        await delay(100);
        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenLastCalledWith(
          'Received unexpected reply',
          unexpectedReply,
        );
      },
    );

    it(`calls logger.error when receiving a ${SERVICE_TYPE_CREATE} reply without a port`, async () => {
      const errorSpy = vi.spyOn(clientLogger, 'error');
      const vatId: VatId = 'v0';
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      client.initWorker(vatId);
      const reply = {
        method: SERVICE_TYPE_CREATE,
        id: 1,
        vatId: 'v0',
      };
      serverPort.postMessage(reply);
      await delay(100);
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy.mock.lastCall?.[0]).toBe(
        'Expected a port with message reply',
      );
      expect(errorSpy.mock.lastCall?.[1]).toMatchObject({ data: reply });
    });
  });

  // low key integration test
  describe('Service', () => {
    beforeEach(() => {
      server = makeServer(serverPort);
      client = makeClient(clientPort);
      server.start();
    });

    it('inits and deletes a worker', async () => {
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
