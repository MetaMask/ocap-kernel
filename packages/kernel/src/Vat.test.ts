import '@ocap/shims/endoify';
import { makeMessagePortStreamPair, MessagePortWriter } from '@ocap/streams';
import { delay, makePromiseKitMock } from '@ocap/test-utils';
import * as ocapUtils from '@ocap/utils';
import type {
  CapTpMessage,
  Command,
  CommandReply,
  StreamEnvelope,
  StreamEnvelopeReply,
} from '@ocap/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Vat } from './Vat.js';

vi.mock('@endo/eventual-send', () => ({
  E: () => ({
    testMethod: vi
      .fn()
      .mockImplementation((param: string) => `param is: ${param}`),
  }),
}));

const { CommandMethod, makeStreamEnvelopeReplyHandler } = ocapUtils;

describe('Vat', () => {
  let vat: Vat;
  let messageChannel: MessageChannel;

  beforeEach(() => {
    vi.resetAllMocks();

    messageChannel = new MessageChannel();

    const streams = makeMessagePortStreamPair<
      StreamEnvelopeReply,
      StreamEnvelope
    >(messageChannel.port1);

    vat = new Vat({
      id: 'test-vat',
      streams,
    });
  });

  describe('init', () => {
    it('initializes the vat and sends a ping message', async () => {
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      const capTpMock = vi
        .spyOn(vat, 'makeCapTp')
        .mockResolvedValueOnce(undefined);

      await vat.init();

      expect(sendMessageMock).toHaveBeenCalledWith({
        method: CommandMethod.Ping,
        params: null,
      });
      expect(capTpMock).toHaveBeenCalled();
    });

    it('throws an error if the stream is invalid', async () => {
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      vi.spyOn(vat, 'makeCapTp').mockResolvedValueOnce(undefined);
      await vat.init();
      const consoleErrorSpy = vi.spyOn(vat.logger, 'error');
      const error = new Error('test-error');
      await vat.streams.reader.throw(error);
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unexpected read error',
        error,
      );
    });
  });

  describe('sendMessage', () => {
    it('sends a message and resolves the promise', async () => {
      const mockMessage = { method: 'makeCapTp', params: null } as Command;
      const sendMessagePromise = vat.sendMessage(mockMessage);
      vat.unresolvedMessages.get('test-vat-1')?.resolve('test-response');
      const result = await sendMessagePromise;
      expect(result).toBe('test-response');
    });
  });

  describe('#receiveMessages', () => {
    it('receives messages correctly', async () => {
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      vi.spyOn(vat, 'makeCapTp').mockResolvedValueOnce(undefined);
      const handleSpy = vi.spyOn(vat.streamEnvelopeReplyHandler, 'handle');
      await vat.init();
      const writer = new MessagePortWriter(messageChannel.port2);
      const rawMessage = { type: 'command', payload: { method: 'test' } };
      await writer.next(rawMessage);
      await delay(10);
      expect(handleSpy).toHaveBeenCalledWith(rawMessage);
    });
  });

  describe('handleMessage', () => {
    it('resolves the payload when the message id exists in unresolvedMessages', async () => {
      const mockMessageId = 'test-vat-1';
      const mockPayload: CommandReply = {
        method: CommandMethod.Evaluate,
        params: 'test-response',
      };
      const mockPromiseKit = { resolve: vi.fn(), reject: vi.fn() };
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);
      await vat.handleMessage({ id: mockMessageId, payload: mockPayload });
      expect(mockPromiseKit.resolve).toHaveBeenCalledWith('test-response');
      expect(vat.unresolvedMessages.has(mockMessageId)).toBe(false);
    });

    it('logs an error when the message id does not exist in unresolvedMessages', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      const nonExistentMessageId = 'non-existent-id';
      const mockPayload: CommandReply = {
        method: CommandMethod.Ping,
        params: 'pong',
      };

      await vat.handleMessage({
        id: nonExistentMessageId,
        payload: mockPayload,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `No unresolved message with id "${nonExistentMessageId}".`,
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('terminate', () => {
    it('terminates the vat and resolves/rejects unresolved messages', async () => {
      const mockMessageId = 'test-vat-1';
      const mockPromiseKit = makePromiseKitMock().makePromiseKit();
      const mockSpy = vi.spyOn(mockPromiseKit, 'reject');
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);
      expect(messageChannel.port1.onmessage).not.toBeNull();
      await vat.terminate();
      expect(messageChannel.port1.onmessage).toBeNull();
      expect(mockSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('makeCapTp', () => {
    it('throws an error if CapTP connection already exists', async () => {
      // @ts-expect-error - Simulating an existing CapTP
      vat.capTp = {};
      await expect(vat.makeCapTp()).rejects.toThrow(
        `Vat with id "${vat.id}" already has a CapTP connection.`,
      );
    });

    it('creates a CapTP connection and sends CapTpInit message', async () => {
      // @ts-expect-error - streamEnvelopeReplyHandler is readonly
      vat.streamEnvelopeReplyHandler = makeStreamEnvelopeReplyHandler(
        {},
        console.warn,
      );
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      await vat.makeCapTp();
      expect(
        vat.streamEnvelopeReplyHandler.contentHandlers.capTp,
      ).toBeDefined();
      expect(sendMessageMock).toHaveBeenCalledWith({
        method: CommandMethod.CapTpInit,
        params: null,
      });
    });

    it('handles CapTp messages', async () => {
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      const wrapCapTpSpy = vi.spyOn(ocapUtils, 'wrapCapTp');
      const consoleLogSpy = vi.spyOn(vat.logger, 'log');

      await vat.makeCapTp();

      const capTpQuestion = {
        type: 'CTP_BOOTSTRAP',
        epoch: 0,
        questionID: 'q-1',
      };
      await vat.streamEnvelopeReplyHandler.contentHandlers.capTp?.(
        capTpQuestion as CapTpMessage,
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'CapTP from vat',
        JSON.stringify(capTpQuestion, null, 2),
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
      expect(wrapCapTpSpy).toHaveBeenCalledWith(capTpAnswer);
    });
  });

  describe('callCapTp', () => {
    it('throws an error if CapTP connection is not established', async () => {
      await expect(
        vat.callCapTp({ method: 'testMethod', params: [] }),
      ).rejects.toThrow(
        `Vat with id "test-vat" does not have a CapTP connection.`,
      );
    });

    it('calls CapTP method with parameters using eventual send', async () => {
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
