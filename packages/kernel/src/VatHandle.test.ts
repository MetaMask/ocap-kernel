import { delay } from '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import type { Logger } from '@ocap/utils';
import { makeLogger } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import { Kernel } from './Kernel.ts';
import { isVatCommandReply, VatCommandMethod } from './messages/index.ts';
import type { VatCommand, VatCommandReply } from './messages/index.ts';
import type { KernelStore } from './store/kernel-store.ts';
import { VatHandle } from './VatHandle.ts';

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
  stream: TestDuplexStream<VatCommandReply, VatCommand>;
}> => {
  const commandStream = await TestDuplexStream.make<
    VatCommandReply,
    VatCommand
  >(() => undefined, {
    validateInput: isVatCommandReply,
  });
  return {
    vat: await VatHandle.make({
      kernel: null as unknown as Kernel,
      storage: null as unknown as KernelStore,
      vatId: 'v0',
      vatConfig: { sourceSpec: 'not-really-there.js' },
      vatStream: commandStream,
      logger,
    }),
    stream: commandStream,
  };
};

describe('VatHandle', () => {
  let sendVatCommandMock: MockInstance<VatHandle['sendVatCommand']>;

  beforeEach(() => {
    sendVatCommandMock = vi
      .spyOn(VatHandle.prototype, 'sendVatCommand')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
  });

  describe('init', () => {
    it('initializes the vat and sends ping & initVat messages', async () => {
      await makeVat();

      expect(sendVatCommandMock).toHaveBeenCalledWith({
        method: VatCommandMethod.ping,
        params: null,
      });
      expect(sendVatCommandMock).toHaveBeenCalledWith({
        method: VatCommandMethod.initVat,
        params: {
          sourceSpec: 'not-really-there.js',
        },
      });
    });

    it('throws if the stream throws', async () => {
      const logger = makeLogger(`[vat v0]`);
      const { stream } = await makeVat(logger);
      const logErrorSpy = vi.spyOn(logger, 'error');
      await stream.receiveInput(NaN);
      await delay(10);
      expect(logErrorSpy).toHaveBeenCalledWith(
        'Unexpected read error',
        expect.any(Error),
      );
    });
  });

  describe('sendVatCommand', () => {
    it('sends a message and resolves the promise', async () => {
      const { vat } = await makeVat();
      const mockMessage = {
        method: VatCommandMethod.ping,
        params: null,
      } as VatCommand['payload'];

      const sendVatCommandPromise = vat.sendVatCommand(mockMessage);

      // Simulate response using handleMessage instead of direct resolver access
      await vat.handleMessage({
        id: 'v0:1',
        payload: {
          method: VatCommandMethod.ping,
          params: 'test-response',
        },
      });

      const result = await sendVatCommandPromise;
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
      const messagePromise = vat.sendVatCommand({
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
      const messagePromise = vat.sendVatCommand({
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
