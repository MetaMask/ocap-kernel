import '@ocap/shims/endoify';
import type { MultiplexEnvelope } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { TestDuplexStream, TestMultiplexer } from '@ocap/test-utils/streams';
import { stringify } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { VatCommandMethod } from './messages/index.js';
import { Supervisor } from './Supervisor.js';

const makeSupervisor = async (
  handleWrite: (input: unknown) => void | Promise<void> = () => undefined,
): Promise<{
  supervisor: Supervisor;
  stream: TestDuplexStream<MultiplexEnvelope, MultiplexEnvelope>;
}> => {
  const stream = await TestDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(handleWrite);
  return {
    supervisor: new Supervisor({
      id: 'test-id',
      multiplexer: new TestMultiplexer(stream),
    }),
    stream,
  };
};

describe('Supervisor', () => {
  describe('init', () => {
    it('initializes the Supervisor correctly', async () => {
      const { supervisor } = await makeSupervisor();
      expect(supervisor).toBeInstanceOf(Supervisor);
      expect(supervisor.id).toBe('test-id');
    });

    it('throws if the stream throws', async () => {
      const { supervisor, stream } = await makeSupervisor();
      const consoleErrorSpy = vi.spyOn(console, 'error');
      await stream.receiveInput(NaN);
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unexpected read error from Supervisor "${supervisor.id}"`,
        expect.any(Error),
      );
    });
  });

  describe('handleMessage', () => {
    it('throws if receiving an unexpected message', async () => {
      const { supervisor, stream } = await makeSupervisor();

      const consoleErrorSpy = vi.spyOn(console, 'error');
      await stream.receiveInput({
        channel: 'command',
        payload: { method: 'test' },
      });
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unexpected read error from Supervisor "${supervisor.id}"`,
        new Error(
          `TestMultiplexer#command: Message failed type validation:\n${stringify(
            {
              method: 'test',
            },
          )}`,
        ),
      );
    });

    it('handles Ping messages', async () => {
      const { supervisor } = await makeSupervisor();
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.ping, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.ping,
        params: 'pong',
      });
    });

    it('handles CapTpInit messages', async () => {
      const { supervisor } = await makeSupervisor();
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.capTpInit, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.capTpInit,
        params: '~~~ CapTP Initialized ~~~',
      });
    });

    it('handles CapTP messages', async () => {
      const handleWrite = vi.fn();
      const { supervisor } = await makeSupervisor(handleWrite);

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.capTpInit, params: null },
      });

      const capTpQuestion = {
        type: 'CTP_BOOTSTRAP',
        epoch: 0,
        questionID: 'q-1',
      };
      expect(supervisor.capTp?.dispatch(capTpQuestion)).toBe(true);

      await delay(10);

      const capTpPayload = {
        type: 'CTP_RETURN',
        epoch: 0,
        answerID: 'q-1',
        result: {
          body: '{"@qclass":"undefined"}',
          slots: [],
        },
      };
      expect(handleWrite).toHaveBeenCalledWith({
        channel: 'capTp',
        payload: capTpPayload,
      });
    });

    it('handles Evaluate messages', async () => {
      const { supervisor } = await makeSupervisor();
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.evaluate, params: '2 + 2' },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.evaluate,
        params: '4',
      });
    });

    it('logs error on invalid Evaluate messages', async () => {
      const { supervisor } = await makeSupervisor();
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        // @ts-expect-error - invalid params type.
        payload: { method: VatCommandMethod.evaluate, params: null },
      });

      expect(replySpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Supervisor received command with unexpected params',
        'null',
      );
    });

    it('handles unknown message types', async () => {
      const { supervisor } = await makeSupervisor();

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          // @ts-expect-error - unknown message type.
          payload: { method: 'UnknownType' },
        }),
      ).rejects.toThrow('Supervisor received unexpected command method:');
    });
  });

  describe('terminate', () => {
    it('terminates correctly', async () => {
      const { supervisor, stream } = await makeSupervisor();

      await supervisor.terminate();
      expect(await stream.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('evaluate', () => {
    it('evaluates code correctly', async () => {
      const { supervisor } = await makeSupervisor();
      const result = supervisor.evaluate('1 + 1');
      expect(result).toBe(2);
    });

    it('returns an error message when evaluation fails', async () => {
      const { supervisor } = await makeSupervisor();
      const result = supervisor.evaluate('invalidCode!');
      expect(result).toBe("Error: Unexpected token '!'");
    });

    it('returns unknown when no error message is given', async () => {
      const { supervisor } = await makeSupervisor();
      const result = supervisor.evaluate('throw new Error("")');
      expect(result).toBe('Error: Unknown');
    });
  });
});
