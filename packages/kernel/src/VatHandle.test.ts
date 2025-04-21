import type { Json } from '@metamask/utils';
import { delay } from '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import type { JsonRpcMessage, Logger } from '@ocap/utils';
import { isJsonRpcMessage, makeLogger } from '@ocap/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

import type { KernelQueue } from './KernelQueue.ts';
import { makeKernelStore } from './store/index.ts';
import type { KernelStore } from './store/index.ts';
import { VatHandle } from './VatHandle.ts';
import { makeMapKernelDatabase } from '../test/storage.ts';

vi.mock('@endo/eventual-send', () => ({
  E: () => ({
    testMethod: vi
      .fn()
      .mockImplementation((param: string) => `param is: ${param}`),
  }),
}));

let mockKernelStore: KernelStore;

const makeVat = async ({
  logger,
  dispatch,
}: {
  logger?: Logger;
  dispatch?: (input: unknown) => void | Promise<void>;
} = {}): Promise<{
  vat: VatHandle;
  stream: TestDuplexStream<JsonRpcMessage, JsonRpcMessage>;
}> => {
  const vatStream = await TestDuplexStream.make<JsonRpcMessage, JsonRpcMessage>(
    dispatch ?? (() => undefined),
    {
      validateInput: isJsonRpcMessage,
    },
  );
  return {
    vat: await VatHandle.make({
      kernelQueue: null as unknown as KernelQueue,
      kernelStore: mockKernelStore,
      vatId: 'v0',
      vatConfig: { sourceSpec: 'not-really-there.js' },
      vatStream,
      logger,
    }),
    stream: vatStream,
  };
};

describe('VatHandle', () => {
  let sendVatCommandMock: MockInstance<VatHandle['sendVatCommand']>;

  beforeEach(() => {
    mockKernelStore = makeKernelStore(makeMapKernelDatabase());
    sendVatCommandMock = vi
      .spyOn(VatHandle.prototype, 'sendVatCommand')
      .mockResolvedValueOnce('fake');
  });

  describe('init', () => {
    it('initializes the vat and sends initVat message', async () => {
      await makeVat();

      expect(sendVatCommandMock).toHaveBeenCalledTimes(1);
      expect(sendVatCommandMock).toHaveBeenCalledWith({
        method: 'initVat' as const,
        params: {
          state: [],
          vatConfig: {
            sourceSpec: 'not-really-there.js',
          },
        },
      });
    });

    it('throws if the stream throws', async () => {
      const logger = makeLogger(`[vat v0]`);
      const { stream } = await makeVat({ logger });
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
      const dispatch = vi.fn();
      const { vat, stream } = await makeVat({ dispatch });
      const mockMessage = {
        method: 'ping' as const,
        params: [] as Json[],
      };

      const sendVatCommandPromise = vat.sendVatCommand(mockMessage);
      await delay(10);
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining(mockMessage),
      );

      await stream.receiveInput({
        id: 'v0:1',
        result: 'test-response',
        jsonrpc: '2.0',
      });

      expect(await sendVatCommandPromise).toBe('test-response');
    });
  });

  describe('terminate', () => {
    it('terminates the vat and rejects unresolved messages', async () => {
      const { vat, stream } = await makeVat();

      // Create a pending message that should be rejected on terminate
      const messagePromise = vat.sendVatCommand({
        method: 'ping' as const,
        params: [],
      });

      await vat.terminate(true);

      await expect(messagePromise).rejects.toThrow('Vat was deleted.');

      expect(await stream.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });
});
