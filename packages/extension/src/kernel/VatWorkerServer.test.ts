import '@ocap/shims/endoify';
import type { NonEmptyArray } from '@metamask/utils';
import { VatNotFoundError } from '@ocap/errors';
import { VatWorkerServiceCommandMethod } from '@ocap/kernel';
import { delay } from '@ocap/test-utils';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { VatWorker } from './vat-worker-service.js';
import type { ExtensionVatWorkerServer } from './VatWorkerServer.js';
import { makeTestServer } from '../../test/vat-worker-service.js';

describe('ExtensionVatWorkerServer', () => {
  let serverPort: MessagePort;
  let clientPort: MessagePort;

  let logger: Logger;

  let server: ExtensionVatWorkerServer;

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    logger = makeLogger('[test server]');
  });

  describe('Misc', () => {
    beforeEach(() => {
      [server] = makeTestServer({ serverPort, logger });
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
      const debugSpy = vi.spyOn(logger, 'debug');
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

  describe('terminateAll', () => {
    let workers: NonEmptyArray<VatWorker>;

    beforeEach(() => {
      [server, ...workers] = makeTestServer({
        serverPort,
        logger,
        nWorkers: 3,
      });
    });

    it('calls logger.error when a vat fails to terminate', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      const vatId = 'v0';
      const vatNotFoundError = new VatNotFoundError(vatId);
      vi.spyOn(workers[0], 'terminate').mockRejectedValue(vatNotFoundError);
      server.start();
      clientPort.postMessage({
        id: 'm0',
        payload: {
          method: VatWorkerServiceCommandMethod.launch,
          params: { vatId, vatConfig: { sourceSpec: 'bogus.js' } },
        },
      });
      clientPort.postMessage({
        id: 'm1',
        payload: {
          method: VatWorkerServiceCommandMethod.terminateAll,
          params: null,
        },
      });

      await delay(100);

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy.mock.lastCall?.[0]).toBe(
        `Error handling ${VatWorkerServiceCommandMethod.terminateAll} for vatId ${vatId}`,
      );
      expect(errorSpy.mock.lastCall?.[1]).toBe(vatNotFoundError);
    });
  });
});
