import '@ocap/shims/endoify';
import type { DuplexStream } from '@ocap/streams';
import { MessagePortDuplexStream, MessagePortWriter } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { VatCommandMethod } from './messages.js';
import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import * as streamEnvelope from './stream-envelope.js';
import { Supervisor } from './Supervisor.js';

describe('Supervisor', () => {
  let stream: DuplexStream<StreamEnvelope, StreamEnvelopeReply>;
  let supervisor: Supervisor;
  let messageChannel: MessageChannel;

  beforeEach(async () => {
    messageChannel = new MessageChannel();

    stream = new MessagePortDuplexStream<StreamEnvelope, StreamEnvelopeReply>(
      messageChannel.port1,
    );
    supervisor = new Supervisor({ id: 'test-id', stream });
  });

  describe('init', () => {
    it('initializes the Supervisor correctly', async () => {
      expect(supervisor).toBeInstanceOf(Supervisor);
      expect(supervisor.id).toBe('test-id');
    });

    it('throws if the stream throws', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      messageChannel.port2.postMessage('foobar');
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unexpected read error from Supervisor "${supervisor.id}"`,
        new Error('Received unexpected message from transport:\n"foobar"'),
      );
    });
  });

  describe('handleMessage', () => {
    it('throws if the stream envelope handler throws', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const writer = new MessagePortWriter(messageChannel.port2);
      const rawMessage = { type: 'command', payload: { method: 'test' } };
      await writer.next(rawMessage);
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Supervisor stream error:',
        'Stream envelope handler received unexpected value',
      );
    });

    it('handles Ping messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.Ping, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.Ping,
        params: 'pong',
      });
    });

    it('handles CapTpInit messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.CapTpInit, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.CapTpInit,
        params: '~~~ CapTP Initialized ~~~',
      });
    });

    it('handles CapTP messages', async () => {
      const wrapCapTpSpy = vi.spyOn(streamEnvelope, 'wrapCapTp');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.CapTpInit, params: null },
      });

      const capTpQuestion = {
        type: 'CTP_BOOTSTRAP',
        epoch: 0,
        questionID: 'q-1',
      };
      expect(supervisor.capTp?.dispatch(capTpQuestion)).toBe(true);

      await delay(10);

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

    it('handles Evaluate messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.Evaluate, params: '2 + 2' },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.Evaluate,
        params: '4',
      });
    });

    it('logs error on invalid Evaluate messages', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        // @ts-expect-error - invalid params type.
        payload: { method: VatCommandMethod.Evaluate, params: null },
      });

      expect(replySpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Supervisor received command with unexpected params',
        'null',
      );
    });

    it('handles unknown message types', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      await supervisor.handleMessage({
        id: 'v0:0',
        // @ts-expect-error - unknown message type.
        payload: { method: 'UnknownType' },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Supervisor received unexpected command method:',
        'UnknownType',
      );
    });
  });

  describe('terminate', () => {
    it('terminates correctly', async () => {
      await supervisor.terminate();
      expect(await stream.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('evaluate', () => {
    it('evaluates code correctly', () => {
      const result = supervisor.evaluate('1 + 1');
      expect(result).toBe(2);
    });

    it('returns an error message when evaluation fails', () => {
      const result = supervisor.evaluate('invalidCode!');
      expect(result).toBe("Error: Unexpected token '!'");
    });

    it('returns unknown when no error message is given', () => {
      const result = supervisor.evaluate('throw new Error("")');
      expect(result).toBe('Error: Unknown');
    });
  });
});
