import '@ocap/shims/endoify';
import { makeMessagePortStreamPair, MessagePortWriter } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CommandMethod } from './command.js';
import type { StreamEnvelope, StreamEnvelopeReply } from './stream-envelope.js';
import * as streamEnvelope from './stream-envelope.js';
import { Supervisor } from './Supervisor.js';

describe('Supervisor', () => {
  let supervisor: Supervisor;
  let messageChannel: MessageChannel;

  beforeEach(async () => {
    vi.resetAllMocks();

    messageChannel = new MessageChannel();

    const streams = makeMessagePortStreamPair<
      StreamEnvelope,
      StreamEnvelopeReply
    >(messageChannel.port1);
    supervisor = new Supervisor({ id: 'test-id', streams });
  });

  describe('init', () => {
    it('initializes the Supervisor correctly', async () => {
      expect(supervisor.id).toBe('test-id');
      expect(supervisor.streams).toBeDefined();
      expect(supervisor.streamEnvelopeHandler).toBeDefined();
    });

    it('throws an error if the stream is invalid', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const error = new Error('test-error');
      await supervisor.streams.reader.throw(error);
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unexpected read error from Supervisor "${supervisor.id}"`,
        error,
      );
    });
  });

  describe('#receiveMessages', () => {
    it('receives messages correctly', async () => {
      const handleSpy = vi.spyOn(supervisor.streamEnvelopeHandler, 'handle');
      const writer = new MessagePortWriter(messageChannel.port2);
      const rawMessage = { type: 'command', payload: { method: 'test' } };
      await writer.next(rawMessage);
      await delay(10);
      expect(handleSpy).toHaveBeenCalledWith(rawMessage);
    });
  });

  describe('handleMessage', () => {
    it('handles Ping messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'message-id',
        payload: { method: CommandMethod.Ping, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('message-id', {
        method: CommandMethod.Ping,
        params: 'pong',
      });
    });

    it('handles CapTpInit messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'message-id',
        payload: { method: CommandMethod.CapTpInit, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('message-id', {
        method: CommandMethod.CapTpInit,
        params: '~~~ CapTP Initialized ~~~',
      });
    });

    it('handles CapTp messages', async () => {
      const wrapCapTpSpy = vi.spyOn(streamEnvelope, 'wrapCapTp');

      await supervisor.handleMessage({
        id: 'message-id',
        payload: { method: CommandMethod.CapTpInit, params: null },
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
        id: 'message-id',
        payload: { method: CommandMethod.Evaluate, params: '2 + 2' },
      });

      expect(replySpy).toHaveBeenCalledWith('message-id', {
        method: CommandMethod.Evaluate,
        params: '4',
      });
    });

    it('logs error on invalid Evaluate messages', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'message-id',
        // @ts-expect-error - invalid params type.
        payload: { method: CommandMethod.Evaluate, params: null },
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
        id: 'message-id',
        // @ts-expect-error - unknown message type.
        payload: { method: 'UnknownType' },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Supervisor received unexpected command method: "UnknownType"',
      );
    });
  });

  describe('terminate', () => {
    it('terminates correctly', async () => {
      expect(messageChannel.port1.onmessage).not.toBeNull();
      await supervisor.terminate();
      expect(messageChannel.port1.onmessage).toBeNull();
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
