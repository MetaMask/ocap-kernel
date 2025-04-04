import '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import type { Logger } from '@ocap/utils';
import { delay, makeLogger } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { VatCommandMethod } from './messages/index.ts';
import type { VatCommand, VatCommandReply } from './messages/index.ts';
import { VatSupervisor } from './VatSupervisor.ts';

vi.mock('./syscall.ts', () => ({
  makeSupervisorSyscall: vi.fn(() => ({
    vatstoreGet: vi.fn(),
    vatstoreSet: vi.fn(),
  })),
}));

vi.mock('@agoric/swingset-liveslots', () => ({
  makeLiveSlots: vi.fn(() => ({
    dispatch: vi.fn(),
    makeVat: vi.fn(),
  })),
}));

const makeVatSupervisor = async (
  handleWrite?: (input: unknown) => void | Promise<void>,
  vatPowers?: Record<string, unknown>,
): Promise<{
  supervisor: VatSupervisor;
  stream: TestDuplexStream<VatCommand, VatCommandReply>;
  logger: Logger;
}> => {
  const logger = makeLogger('[test-vat-supervisor]');
  const commandStream = await TestDuplexStream.make<
    VatCommand,
    VatCommandReply
  >(handleWrite ?? (() => undefined));
  return {
    supervisor: new VatSupervisor({
      id: 'test-id',
      commandStream,
      vatPowers: vatPowers ?? {},
      logger,
    }),
    stream: commandStream,
    logger,
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
      const { supervisor, stream, logger } = await makeVatSupervisor();
      const errorSpy = vi
        .spyOn(logger, 'error')
        .mockImplementation(() => undefined);
      await stream.receiveInput(NaN);
      await delay(10);
      expect(errorSpy).toHaveBeenCalledWith(
        `Unexpected read error from VatSupervisor "${supervisor.id}"`,
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });
  });

  describe('handleMessage', () => {
    it('throws if receiving an unexpected message', async () => {
      const { supervisor, stream, logger } = await makeVatSupervisor();

      const errorSpy = vi
        .spyOn(logger, 'error')
        .mockImplementation(() => undefined);
      await stream.receiveInput({
        channel: 'command',
        payload: { method: 'test' },
      });
      await delay(10);
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(
        `Unexpected read error from VatSupervisor "${supervisor.id}"`,
        new Error(`VatSupervisor received unexpected command method: "test"`),
      );
      errorSpy.mockRestore();
    });

    it('handles Ping messages', async () => {
      const { supervisor } = await makeVatSupervisor();
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.ping, params: [] },
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
