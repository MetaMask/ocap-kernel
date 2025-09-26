import { delay, isJsonRpcMessage } from '@metamask/kernel-utils';
import type { JsonRpcMessage } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { rpcErrors } from '@metamask/rpc-errors';
import type { PlatformFactory } from '@ocap/kernel-platforms';
import '@ocap/test-utils';
import { TestDuplexStream } from '@ocap/test-utils/streams';
import { describe, it, expect, vi } from 'vitest';

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

const makeVatSupervisor = async ({
  dispatch,
  logger,
  vatPowers,
  makePlatform,
  platformOptions,
}: {
  dispatch?: (input: unknown) => void | Promise<void>;
  logger?: Logger;
  vatPowers?: Record<string, unknown>;
  makePlatform?: PlatformFactory;
  platformOptions?: Record<string, unknown>;
} = {}): Promise<{
  supervisor: VatSupervisor;
  stream: TestDuplexStream<JsonRpcMessage, JsonRpcMessage>;
}> => {
  const kernelStream = await TestDuplexStream.make<
    JsonRpcMessage,
    JsonRpcMessage
  >(dispatch ?? (() => undefined), { validateInput: isJsonRpcMessage });

  // Provide a default makePlatform if none is specified
  const defaultMakePlatform: PlatformFactory = vi.fn().mockResolvedValue({});

  return {
    supervisor: new VatSupervisor({
      id: 'test-id',
      kernelStream,
      logger: logger ?? new Logger(),
      vatPowers: vatPowers ?? {},
      makePlatform: makePlatform ?? defaultMakePlatform,
      platformOptions: platformOptions ?? {},
    }),
    stream: kernelStream,
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
      const logger = {
        error: vi.fn(),
        subLogger: vi.fn(() => logger),
      } as unknown as Logger;
      const { supervisor, stream } = await makeVatSupervisor({ logger });
      await stream.receiveInput(NaN);
      await delay(10);
      expect(logger.error).toHaveBeenCalledWith(
        `Unexpected read error from VatSupervisor "${supervisor.id}"`,
        expect.any(Error),
      );
    });
  });

  describe('handleMessage', () => {
    it('responds with an error for unknown methods', async () => {
      const dispatch = vi.fn();
      const { stream } = await makeVatSupervisor({ dispatch });

      await stream.receiveInput({
        id: 'v0:0',
        method: 'bogus',
        params: [],
        jsonrpc: '2.0',
      });
      await delay(10);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'v0:0',
          error: expect.objectContaining({
            code: rpcErrors.methodNotFound().code,
          }),
        }),
      );
    });

    it('handles "ping" requests', async () => {
      const dispatch = vi.fn();
      const { stream } = await makeVatSupervisor({ dispatch });

      await stream.receiveInput({
        id: 'v0:0',
        method: 'ping',
        params: [],
        jsonrpc: '2.0',
      });
      await delay(10);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'v0:0',
          result: 'pong',
        }),
      );
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

  describe('platform configuration', () => {
    it('accepts makePlatform and platformOptions parameters', async () => {
      const makePlatform = vi.fn().mockResolvedValue({});
      const platformOptions = { fetch: { fromFetch: globalThis.fetch } };

      const { supervisor } = await makeVatSupervisor({
        makePlatform,
        platformOptions,
      });

      expect(supervisor).toBeInstanceOf(VatSupervisor);
      expect(supervisor.id).toBe('test-id');
    });

    it('provides default platformOptions when not specified', async () => {
      const makePlatform = vi.fn().mockResolvedValue({});

      const { supervisor } = await makeVatSupervisor({
        makePlatform,
        // platformOptions omitted
      });

      expect(supervisor).toBeInstanceOf(VatSupervisor);
    });
  });
});
