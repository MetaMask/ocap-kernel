import '@ocap/shims/endoify';
import type { StreamEnvelope } from '@ocap/streams';
import { Command, makeMessagePortStreamPair } from '@ocap/streams';
import { messagePortTracker } from '@ocap/test-utils';
import type { MessagePortTracker } from '@ocap/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Supervisor } from './Supervisor.js';

describe('Supervisor', () => {
  let supervisor: Supervisor;
  let port1: MessagePort;
  let tracker: MessagePortTracker;

  beforeEach(async () => {
    vi.resetAllMocks();

    const messageChannel = new MessageChannel();
    port1 = messageChannel.port1;
    tracker = messagePortTracker(port1);

    const streams = makeMessagePortStreamPair<StreamEnvelope>(port1);
    supervisor = new Supervisor({ id: 'test-id', streams });
  });

  describe('init', () => {
    it('initializes the Supervisor correctly', () => {
      expect(supervisor.id).toBe('test-id');
      expect(supervisor.streams).toBeDefined();
      expect(supervisor.streamEnvelopeHandler).toBeDefined();
    });
  });

  describe('handleMessage', () => {
    it('should handle Command.Ping messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'message-id',
        message: { type: Command.Ping, data: null },
      });

      expect(replySpy).toHaveBeenCalledWith('message-id', {
        type: Command.Ping,
        data: 'pong',
      });
    });

    it('should handle Command.CapTpInit messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'message-id',
        message: { type: Command.CapTpInit, data: null },
      });

      expect(replySpy).toHaveBeenCalledWith('message-id', {
        type: Command.CapTpInit,
        data: null,
      });
    });

    it('should handle Command.Evaluate messages', async () => {
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'message-id',
        message: { type: Command.Evaluate, data: '2 + 2' },
      });

      expect(replySpy).toHaveBeenCalledWith('message-id', {
        type: Command.Evaluate,
        data: '4',
      });
    });

    it('should handle unknown message types', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      await supervisor.handleMessage({
        id: 'message-id',
        // @ts-expect-error - unknown message type.
        message: { type: 'UnknownType' },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Unknown message type: UnknownType',
      );
    });
  });

  describe('terminate', () => {
    it('should terminate correctly', async () => {
      expect(tracker.isOpen()).toBe(true);
      await supervisor.terminate();
      expect(tracker.isOpen()).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('should evaluate code correctly', () => {
      const result = supervisor.evaluate('1 + 1');
      expect(result).toBe(2);
    });

    it('should return an error message when evaluation fails', () => {
      const result = supervisor.evaluate('invalidCode!');
      expect(result).toBe("Error: Unexpected token '!'");
    });
  });
});
