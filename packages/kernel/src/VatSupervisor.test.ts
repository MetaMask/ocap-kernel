import '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { delay } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { VatCommandMethod } from './messages/index.js';
import type { VatCommand, VatCommandReply } from './messages/index.js';
import { VatSupervisor } from './VatSupervisor.js';

const makeVatSupervisor = async (
  handleWrite: (input: unknown) => void | Promise<void> = () => undefined,
): Promise<{
  supervisor: VatSupervisor;
  stream: TestDuplexStream<VatCommand, VatCommandReply>;
}> => {
  const commandStream = await TestDuplexStream.make<
    VatCommand,
    VatCommandReply
  >(handleWrite);
  return {
    supervisor: new VatSupervisor({
      id: 'test-id',
      commandStream,
      // @ts-expect-error Mock
      makeKVStore: async () => ({}),
    }),
    stream: commandStream,
  };
};

describe('VatSupervisor', () => {
  describe('init', () => {
    it('initializes the VatSupervisor correctly', async () => {
      const { supervisor } = await makeVatSupervisor();
      expect(supervisor).toBeInstanceOf(VatSupervisor);
      expect(supervisor.id).toBe('test-id');
    });

    it('throws if the stream throws', async () => {
      const { supervisor, stream } = await makeVatSupervisor();
      const consoleErrorSpy = vi.spyOn(console, 'error');
      await stream.receiveInput(NaN);
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unexpected read error from VatSupervisor "${supervisor.id}"`,
        expect.any(Error),
      );
    });
  });

  describe('handleMessage', () => {
    it('throws if receiving an unexpected message', async () => {
      const { supervisor, stream } = await makeVatSupervisor();

      const consoleErrorSpy = vi.spyOn(console, 'error');
      await stream.receiveInput({
        channel: 'command',
        payload: { method: 'test' },
      });
      await delay(10);
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Unexpected read error from VatSupervisor "${supervisor.id}"`,
        new Error(`VatSupervisor received unexpected command method: "test"`),
      );
    });

    it('handles Ping messages', async () => {
      const { supervisor } = await makeVatSupervisor();
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

    it('handles unknown message types', async () => {
      const { supervisor } = await makeVatSupervisor();

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          // @ts-expect-error - unknown message type.
          payload: { method: 'UnknownType' },
        }),
      ).rejects.toThrow('VatSupervisor received unexpected command method:');
    });
  });

  describe('terminate', () => {
    it('terminates correctly', async () => {
      const { supervisor, stream } = await makeVatSupervisor();

      await supervisor.terminate();
      expect(await stream.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });
});
