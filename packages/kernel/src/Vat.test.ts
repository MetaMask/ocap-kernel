import '@ocap/shims/endoify';
import {
  VatCapTpConnectionExistsError,
  VatCapTpConnectionNotFoundError,
} from '@ocap/errors';
import type { DuplexStream } from '@ocap/streams';
import { MessagePortDuplexStream, MessagePortWriter } from '@ocap/streams';
import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { stringify } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { VatCommandMethod } from './messages.js';
import type { CapTpMessage, VatCommand, VatCommandReply } from './messages.js';
import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import * as streamEnvelope from './stream-envelope.js';
import { makeStreamEnvelopeReplyHandler } from './stream-envelope.js';
import { Vat } from './Vat.js';

vi.mock('@endo/eventual-send', () => ({
  E: () => ({
    testMethod: vi
      .fn()
      .mockImplementation((param: string) => `param is: ${param}`),
  }),
}));

const makeVat = (messageChannel = new MessageChannel()): Vat => {
  const stream = new MessagePortDuplexStream<
    StreamEnvelopeReply,
    StreamEnvelope
  >(messageChannel.port1);
  return new Vat({ id: 'v0', stream });
};

describe('Vat', () => {
  describe('init', () => {
    it('initializes the vat and sends a ping message', async () => {
      const vat = makeVat();
      const sendMessageMock = vi
        .spyOn(vat, 'sendMessage')
        .mockResolvedValueOnce(undefined);
      const capTpMock = vi
        .spyOn(vat, 'makeCapTp')
        .mockResolvedValueOnce(undefined);

      await vat.init();

      expect(sendMessageMock).toHaveBeenCalledWith({
        method: VatCommandMethod.Ping,
        params: null,
      });
      expect(capTpMock).toHaveBeenCalled();
    });

    it('throws an error if the stream is invalid', async () => {
      const messageChannel = new MessageChannel();
      const vat = makeVat(messageChannel);
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      vi.spyOn(vat, 'makeCapTp').mockResolvedValueOnce(undefined);
      await vat.init();
      const consoleErrorSpy = vi.spyOn(vat.logger, 'error');
      messageChannel.port2.postMessage('foobar');
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unexpected read error',
        new Error('Received unexpected message from transport:\n"foobar"'),
      );
    });
  });

  describe('sendMessage', () => {
    it('sends a message and resolves the promise', async () => {
      const vat = makeVat();
      const mockMessage = {
        method: VatCommandMethod.Ping,
        params: null,
      } as VatCommand['payload'];
      const sendMessagePromise = vat.sendMessage(mockMessage);
      vat.unresolvedMessages.get('v0:1')?.resolve('test-response');
      const result = await sendMessagePromise;
      expect(result).toBe('test-response');
    });
  });

  describe('#receiveMessages', () => {
    it('receives messages correctly', async () => {
      const messageChannel = new MessageChannel();
      const vat = makeVat(messageChannel);
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
      const vat = makeVat();
      const mockMessageId = 'v0:1';
      const mockPayload: VatCommandReply['payload'] = {
        method: VatCommandMethod.Evaluate,
        params: 'test-response',
      };
      const mockPromiseKit = { resolve: vi.fn(), reject: vi.fn() };
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);
      await vat.handleMessage({ id: mockMessageId, payload: mockPayload });
      expect(mockPromiseKit.resolve).toHaveBeenCalledWith('test-response');
      expect(vat.unresolvedMessages.has(mockMessageId)).toBe(false);
    });

    it('logs an error when the message id does not exist in unresolvedMessages', async () => {
      const vat = makeVat();
      const consoleErrorSpy = vi.spyOn(console, 'error');

      const nonExistentMessageId = 'v0:9';
      const mockPayload: VatCommandReply['payload'] = {
        method: VatCommandMethod.Ping,
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
      const messageChannel = new MessageChannel();
      vi.spyOn(messageChannel.port1, 'addEventListener');
      vi.spyOn(messageChannel.port1, 'removeEventListener');
      const vat = makeVat(messageChannel);

      const mockMessageId = 'v0:1';
      const mockPromiseKit = makePromiseKitMock().makePromiseKit();
      const rejectSpy = vi.spyOn(mockPromiseKit, 'reject');
      vat.unresolvedMessages.set(mockMessageId, mockPromiseKit);

      expect(messageChannel.port1.addEventListener).toHaveBeenCalledOnce();
      expect(messageChannel.port1.removeEventListener).not.toHaveBeenCalled();
      await vat.terminate();
      expect(messageChannel.port1.removeEventListener).toHaveBeenCalled();
      expect(rejectSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('makeCapTp', () => {
    it('throws an error if CapTP connection already exists', async () => {
      const vat = makeVat();
      // @ts-expect-error - Simulating an existing CapTP
      vat.capTp = {};
      await expect(vat.makeCapTp()).rejects.toThrow(
        VatCapTpConnectionExistsError,
      );
    });

    it('creates a CapTP connection and sends CapTpInit message', async () => {
      const vat = makeVat();
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
        method: VatCommandMethod.CapTpInit,
        params: null,
      });
    });

    it('handles CapTP messages', async () => {
      const vat = makeVat();
      vi.spyOn(vat, 'sendMessage').mockResolvedValueOnce(undefined);
      const wrapCapTpSpy = vi.spyOn(streamEnvelope, 'wrapCapTp');
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
        stringify(capTpQuestion),
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
      const vat = makeVat();
      await expect(
        vat.callCapTp({ method: 'testMethod', params: [] }),
      ).rejects.toThrow(VatCapTpConnectionNotFoundError);
    });

    it('calls CapTP method with parameters using eventual send', async () => {
      const vat = makeVat();
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
