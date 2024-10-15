import '@ocap/shims/endoify';
import type { VatId } from '@ocap/kernel';
import { delay } from '@ocap/test-utils';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { VatWorkerServiceMethod } from './vat-worker-service.js';
import type { ExtensionVatWorkerClient } from './VatWorkerClient.js';
import { makeTestClient } from '../test/vat-worker-service.js';

describe('ExtensionVatWorkerClient', () => {
  let serverPort: MessagePort;
  let clientPort: MessagePort;

  let clientLogger: Logger;

  let client: ExtensionVatWorkerClient;

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    clientLogger = makeLogger('[test client]');
    client = makeTestClient(clientPort, clientLogger);
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
    ${VatWorkerServiceMethod.Launch}
    ${VatWorkerServiceMethod.Terminate}
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

  it(`calls logger.error when receiving a ${VatWorkerServiceMethod.Launch} reply without a port`, async () => {
    const errorSpy = vi.spyOn(clientLogger, 'error');
    const vatId: VatId = 'v0';
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    client.launch(vatId);
    const reply = {
      method: VatWorkerServiceMethod.Launch,
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
