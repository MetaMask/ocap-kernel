import type { MultiplexEnvelope } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { TestDuplexStream, TestMultiplexer } from '@ocap/test-utils/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { Kernel } from './Kernel.js';
import { isVatCommandReply, VatCommandMethod } from './messages/index.js';
import type { VatCommand, VatCommandReply } from './messages/index.js';
import type { KernelStore } from './store/kernel-store.js';
import { VatHandle } from './VatHandle.js';

vi.mock('@endo/eventual-send', () => ({
  E: () => ({
    testMethod: vi
      .fn()
      .mockImplementation((param: string) => `param is: ${param}`),
  }),
}));

const makeVat = async (
  logger?: Logger,
): Promise<{
  vat: VatHandle;
  stream: TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>;
}> => {
  const stream = await TestDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(() => undefined);
  const multiplexer = await TestMultiplexer.make(stream);
  const vatStream = multiplexer.createChannel<VatCommandReply, VatCommand>(
    'command',
    isVatCommandReply,
  );
  multiplexer.start().catch((error) => {
    throw error;
  });
  await multiplexer.synchronizeChannels('command');
  return {
    vat: new VatHandle({
      kernel: null as unknown as Kernel,
      storage: null as unknown as KernelStore,
      vatId: 'v0',
      vatConfig: { sourceSpec: 'not-really-there.js' },
      vatStream,
      logger,
    }),
    stream,
  };
};

describe('VatHandle', () => {
  describe('init', () => {
    it('initializes the vat and sends ping & initVat messages', async () => {
      const { vat } = await makeVat();
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await vat.init();

      expect(sendMessageMock).toHaveBeenCalledWith({
        method: VatCommandMethod.ping,
        params: null,
      });
      expect(sendMessageMock).toHaveBeenCalledWith({
        method: VatCommandMethod.initVat,
        params: {
          sourceSpec: 'not-really-there.js',
        },
      });
    });

    it('throws if the stream throws', async () => {
      const logger = makeLogger(`[vat v0]`);
      const { vat, stream } = await makeVat(logger);
      vi.spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      await vat.init();
      const logErrorSpy = vi.spyOn(logger, 'error');
      await stream.receiveInput(NaN);
      await delay(10);
      expect(logErrorSpy).toHaveBeenCalledWith(
        'Unexpected read error',
        expect.any(Error),
      );
    });
  });

  describe('sendMessage', () => {
    it('sends a message and resolves the promise', async () => {
      const { vat } = await makeVat();
      const mockMessage = {
        method: VatCommandMethod.ping,
        params: null,
      } as VatCommand['payload'];

      const sendMessagePromise = vat.sendMessage(mockMessage);

      // Simulate response using handleMessage instead of direct resolver access
      await vat.handleMessage({
        id: 'v0:1',
        payload: {
          method: VatCommandMethod.ping,
          params: 'test-response',
        },
      });

      const result = await sendMessagePromise;
      expect(result).toBe('test-response');
    });
  });

  describe('handleMessage', () => {
    it('resolves the payload when the message id exists', async () => {
      const { vat } = await makeVat();
      const mockMessageId = 'v0:1';
      const mockPayload: VatCommandReply['payload'] = {
        method: VatCommandMethod.ping,
        params: 'test',
      };

      // Create a pending message first
      const messagePromise = vat.sendMessage({
        method: VatCommandMethod.ping,
        params: null,
      });

      // Handle the response
      await vat.handleMessage({ id: mockMessageId, payload: mockPayload });

      const result = await messagePromise;
      expect(result).toBe('test');
    });
  });

  describe('terminate', () => {
    it('terminates the vat and rejects unresolved messages', async () => {
      const { vat, stream } = await makeVat();

      // Create a pending message that should be rejected on terminate
      const messagePromise = vat.sendMessage({
        method: VatCommandMethod.ping,
        params: null,
      });

      await vat.terminate();

      await expect(messagePromise).rejects.toThrow('Vat was deleted.');
      expect(await stream.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });
});
