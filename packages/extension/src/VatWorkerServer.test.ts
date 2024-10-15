import '@ocap/shims/endoify';
import { delay } from '@ocap/test-utils';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ExtensionVatWorkerServer } from './VatWorkerServer.js';
import { makeTestServer } from '../test/vat-worker-service.js';

describe('ExtensionVatWorkerServer', () => {
  let serverPort: MessagePort;
  let clientPort: MessagePort;

  let logger: Logger;

  let server: ExtensionVatWorkerServer;

  // let vatPort: MessagePort;
  let kernelPort: MessagePort;

  beforeEach(() => {
    const serviceMessageChannel = new MessageChannel();
    serverPort = serviceMessageChannel.port1;
    clientPort = serviceMessageChannel.port2;

    logger = makeLogger('[test server]');

    const deliveredMessageChannel = new MessageChannel();
    // vatPort = deliveredMessageChannel.port1;
    kernelPort = deliveredMessageChannel.port2;

    server = makeTestServer({ serverPort, logger, kernelPort });
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
