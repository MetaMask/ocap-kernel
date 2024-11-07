import '@ocap/shims/endoify';
import {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
} from '@ocap/errors';
import type { MultiplexEnvelope } from '@ocap/streams';
import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { TestDuplexStream, TestMultiplexer } from '@ocap/test-utils/streams';
import { makeLogger, stringify } from '@ocap/utils';
import type { Logger } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { VatCommandMethod } from './messages/index.js';
import type { VatCommand, VatCommandReply } from './messages/index.js';
import { Vat } from './Vat.js';

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
  vat: Vat;
  stream: TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>;
}> => {
  const stream = await TestDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(() => undefined);
  return {
    vat: new Vat({
      id: 'v0',
      multiplexer: new TestMultiplexer(stream),
      logger,
    }),
    stream,
  };
};

describe('Vat', () => {
  describe('init', () => {
    it('initializes the vat and sends a ping message', async () => {
      const { vat } = await makeVat();
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      const capTpMock = vi
        .spyOn(vat, 'makeCapTp')
        .mockResolvedValueOnce(undefined);

      await vat.init();

      expect(sendMessageMock).toHaveBeenCalledWith({
        method: VatCommandMethod.ping,
        params: null,
      });
      expect(capTpMock).toHaveBeenCalled();
    });

    it('throws if the stream throws', async () => {
      const { vat, stream } = await makeVat();
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      vi.spyOn(vat, 'makeCapTp').mockResolvedValueOnce(undefined);
      await vat.init();
      const logErrorSpy = vi.spyOn(vat.logger, 'error');
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
      vat.unresolvedMessages.get('v0:1')?.resolve('test-response');
      const result = await sendMessagePromise;
      expect(result).toBe('test-response');
    });
  });

  describe('handleMessage', () => {
    it('resolves the payload when the message id exists in unresolvedMessages', async () => {
      const { vat } = await makeVat();
      const mockMessageId = 'v0:1';
      const mockPayload: VatCommandReply['payload'] = {
        method: VatCommandMethod.evaluate,
        params: 'test-response',
      };
      const mockPromiseKit = { resolve: vi.fn(), reject: vi.fn() };
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);
      await vat.handleMessage({ id: mockMessageId, payload: mockPayload });
      expect(mockPromiseKit.resolve).toHaveBeenCalledWith('test-response');
      expect(vat.unresolvedMessages.has(mockMessageId)).toBe(false);
    });

    it('logs an error when the message id does not exist in unresolvedMessages', async () => {
      const { vat } = await makeVat();
      const logErrorSpy = vi.spyOn(vat.logger, 'error');

      const nonExistentMessageId = 'v0:9';
      const mockPayload: VatCommandReply['payload'] = {
        method: VatCommandMethod.ping,
        params: 'pong',
      };

      await vat.handleMessage({
        id: nonExistentMessageId,
        payload: mockPayload,
      });

      expect(logErrorSpy).toHaveBeenCalledWith(
        `No unresolved message with id "${nonExistentMessageId}".`,
      );
      logErrorSpy.mockRestore();
    });
  });

  describe('terminate', () => {
    it('terminates the vat and resolves/rejects unresolved messages', async () => {
      const { vat, stream } = await makeVat();

      const mockMessageId = 'v0:1';
      const mockPromiseKit = makePromiseKitMock().makePromiseKit();
      const rejectSpy = vi.spyOn(mockPromiseKit, 'reject');
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);

      await vat.terminate();
      expect(rejectSpy).toHaveBeenCalledWith(expect.any(Error));
      expect(await stream.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('makeCapTp', () => {
    it('throws an error if CapTP connection already exists', async () => {
      const { vat } = await makeVat();
      // @ts-expect-error - Simulating an existing CapTP
      vat.capTp = {};
      await expect(vat.makeCapTp()).rejects.toThrow(
        VatCapTpConnectionExistsError,
      );
    });

    it('creates a CapTP connection and sends CapTpInit message', async () => {
      const { vat } = await makeVat();
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      await vat.makeCapTp();
      expect(sendMessageMock).toHaveBeenCalledWith({
        method: VatCommandMethod.capTpInit,
        params: null,
      });
    });

    it('handles CapTP messages', async () => {
      const logger = makeLogger('[test]');
      const logSpy = vi.spyOn(logger, 'log');
      const { vat, stream } = await makeVat(logger);
      vi.spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await vat.init();

      const capTpPayload = {
        type: 'CTP_BOOTSTRAP',
        epoch: 0,
        questionID: 'q-1',
      };
      await stream.receiveInput({ channel: 'capTp', payload: capTpPayload });
      await delay(10);

      expect(logSpy).toHaveBeenCalledWith(
        'CapTP from vat',
        stringify(capTpPayload),
      );

      const capTpAnswer = {
        type: 'CTP_RETURN',
        epoch: 0,
        answerID: 'q-1',
        result: {
          body: '{"@qclass":"undefined"}',
          slots: [],
        },
      };

      expect(logSpy).toHaveBeenLastCalledWith(
        'CapTP to vat',
        stringify(capTpAnswer),
      );
    });
  });

  describe('callCapTp', () => {
    it('throws an error if CapTP connection is not established', async () => {
      const { vat } = await makeVat();
      await expect(
        vat.callCapTp({ method: 'testMethod', params: [] }),
      ).rejects.toThrow(VatCapTpConnectionNotFoundError);
    });

    it('calls CapTP method with parameters using eventual send', async () => {
      const { vat } = await makeVat();
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      await vat.makeCapTp();

      const eventualSend = await import('@endo/eventual-send');
      const eSpy = vi.spyOn(eventualSend, 'E');

      const result = await vat.callCapTp({
        method: 'testMethod',
        params: ['test-param'],
      });

      expect(eSpy).toHaveBeenCalledOnce();
      expect(result).toBe('param is: test-param');
    });
  });
});
