import type { Json } from '@metamask/utils';
import type { MultiplexEnvelope } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { TestDuplexStream, TestMultiplexer } from '@ocap/test-utils/streams';
import { stringify } from '@ocap/utils';
import { describe, it, expect, vi } from 'vitest';

import { isVatCommand, VatCommandMethod } from './messages/index.js';
import type { VatCommand, VatCommandReply } from './messages/index.js';
import { Baggage } from './storage/baggage.js';
import { Supervisor } from './Supervisor.js';
import { makeMapKVStore } from '../test/storage.js';

vi.mock('@endo/import-bundle', () => ({
  importBundle: vi.fn((code) => code),
}));
vi.mock('@endo/exo');

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
  const multiplexer = await TestMultiplexer.make(stream);
  const commandStream = multiplexer.createChannel<VatCommand, VatCommandReply>(
    'command',
    isVatCommand,
  );
  const capTpStream = multiplexer.createChannel<Json, Json>('capTp');
  multiplexer.start().catch((error) => {
    throw error;
  });
  await multiplexer.synchronizeChannels('command', 'capTp');

  const kvStore = makeMapKVStore();
  return {
    supervisor: new Supervisor({
      id: 'test-id',
      commandStream,
      capTpStream,
      kvStore,
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

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              start: () => ({
                name: 'testVat',
                methods: {
                  ping: () => 'pong',
                },
              }),
            }),
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      // First we need to load user code to set the bootstrap object
      await supervisor.handleMessage({
        id: 'v0:0',
        payload: {
          method: VatCommandMethod.loadUserCode,
          params: {
            bundleSpec: 'http://example.com/bundle.js',
            parameters: {},
          },
        },
      });

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

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              start: () => ({
                name: 'testVat',
                methods: {
                  ping: () => 'pong',
                },
              }),
            }),
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      // First we need to load user code to set the bootstrap object
      await supervisor.handleMessage({
        id: 'v0:0',
        payload: {
          method: VatCommandMethod.loadUserCode,
          params: {
            bundleSpec: 'http://example.com/bundle.js',
            parameters: {},
          },
        },
      });

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

  describe('method schema', () => {
    it('initializes with empty method schema', async () => {
      const { supervisor } = await makeSupervisor();
      expect(supervisor.methodSchema).toStrictEqual([]);
    });

    it('generates method schema when loading user code', async () => {
      const { supervisor } = await makeSupervisor();

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              start: () => ({
                name: 'testVat',
                methods: {
                  simpleMethod: (param1: string, param2: number) =>
                    `${param1} ${param2}`,
                  optionalParam: (param?: string) => param,
                  noParams: () => 'test',
                },
              }),
            }),
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: {
          method: VatCommandMethod.loadUserCode,
          params: {
            bundleSpec: 'http://example.com/bundle.js',
            parameters: {},
          },
        },
      });

      expect(supervisor.methodSchema).toHaveLength(3);
      expect(supervisor.methodSchema).toStrictEqual([
        { name: 'simpleMethod', parameters: ['param1', 'param2'] },
        { name: 'optionalParam', parameters: ['param'] },
        { name: 'noParams', parameters: [] },
      ]);
    });

    it('handles empty methods object when loading user code', async () => {
      const { supervisor } = await makeSupervisor();

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              start: () => ({
                name: 'testVat',
                methods: {},
              }),
            }),
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: {
          method: VatCommandMethod.loadUserCode,
          params: {
            bundleSpec: 'http://example.com/bundle.js',
            parameters: {},
          },
        },
      });

      expect(supervisor.methodSchema).toStrictEqual([]);
    });

    it('handles undefined methods when loading user code', async () => {
      const { supervisor } = await makeSupervisor();

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              start: () => ({
                name: 'testVat',
              }),
            }),
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: {
          method: VatCommandMethod.loadUserCode,
          params: {
            bundleSpec: 'http://example.com/bundle.js',
            parameters: {},
          },
        },
      });

      expect(supervisor.methodSchema).toStrictEqual([]);
    });

    it('responds to getMethodSchema command', async () => {
      const { supervisor } = await makeSupervisor();
      const replySpy = vi.spyOn(supervisor, 'replyToMessage');

      await supervisor.handleMessage({
        id: 'v0:0',
        payload: { method: VatCommandMethod.getMethodSchema, params: null },
      });

      expect(replySpy).toHaveBeenCalledWith('v0:0', {
        method: VatCommandMethod.getMethodSchema,
        params: [],
      });
    });
  });

  describe('error handling', () => {
    it('logs error when baggage initialization fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      // we need to mock Baggage.create to throw an error
      vi.spyOn(Baggage, 'create').mockRejectedValueOnce(
        new Error('Test error'),
      );

      await makeSupervisor();
      await delay(10); // Wait for initialization to complete

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to initialize baggage:',
        expect.any(Error),
      );
    });

    it('handles unexpected params in evaluate command', async () => {
      const { supervisor } = await makeSupervisor();
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await supervisor.handleMessage({
        id: 'test',
        // @ts-expect-error - invalid params type.
        payload: {
          method: VatCommandMethod.evaluate,
          params: { invalid: 'type' },
        },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Supervisor received command with unexpected params',
        expect.any(String),
      );
    });

    it('throws error for unexpected command methods', async () => {
      const { supervisor } = await makeSupervisor();

      await expect(
        supervisor.handleMessage({
          id: 'test',
          payload: {
            // @ts-expect-error Testing invalid method
            method: 'invalidMethod',
            params: null,
          },
        }),
      ).rejects.toThrow('Supervisor received unexpected command method:');
    });
  });

  describe('loadUserCode', () => {
    it('throws error if user code is already loaded', async () => {
      const { supervisor } = await makeSupervisor();

      // First load
      await supervisor.handleMessage({
        id: 'v0:0',
        payload: {
          method: VatCommandMethod.loadUserCode,
          params: {
            bundleSpec: 'http://example.com/bundle.js',
            parameters: {},
          },
        },
      });

      // Second load attempt
      await expect(
        supervisor.handleMessage({
          id: 'v0:1',
          payload: {
            method: VatCommandMethod.loadUserCode,
            params: {
              bundleSpec: 'http://example.com/bundle.js',
              parameters: {},
            },
          },
        }),
      ).rejects.toThrow(
        'Supervisor received LoadUserCode after user code already loaded',
      );
    });

    it('throws error for invalid vat config', async () => {
      const { supervisor } = await makeSupervisor();

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          payload: {
            method: VatCommandMethod.loadUserCode,
            params: { invalid: 'config' },
          },
        }),
      ).rejects.toThrow(
        'Supervisor received LoadUserCode with bad config parameter',
      );
    });

    it('throws error when bundleSpec is missing', async () => {
      const { supervisor } = await makeSupervisor();

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          payload: {
            method: VatCommandMethod.loadUserCode,
            params: {
              bundleName: 'testVat',
              parameters: {},
            },
          },
        }),
      ).rejects.toThrow(
        'for now, only bundleSpec is support in vatConfig specifications',
      );
    });

    it('throws error when fetch fails', async () => {
      const { supervisor } = await makeSupervisor();

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: false,
            status: 404,
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          payload: {
            method: VatCommandMethod.loadUserCode,
            params: {
              bundleSpec: 'http://example.com/bundle.js',
              parameters: {},
            },
          },
        }),
      ).rejects.toThrow(
        'fetch of user code http://example.com/bundle.js failed: 404',
      );
    });

    it('throws error when start function is missing', async () => {
      const { supervisor } = await makeSupervisor();

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({}), // Empty bundle with no start function
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          payload: {
            method: VatCommandMethod.loadUserCode,
            params: {
              bundleSpec: 'http://example.com/bundle.js',
              parameters: {},
            },
          },
        }),
      ).rejects.toThrow(
        'vat module http://example.com/bundle.js has no start function',
      );
    });

    it('throws error when vat object has no name property', async () => {
      const { supervisor } = await makeSupervisor();

      // eslint-disable-next-line vitest/prefer-spy-on, n/no-unsupported-features/node-builtins
      global.fetch = vi.fn(
        async () =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              start: () => ({
                // Missing name property
                methods: {},
              }),
            }),
            // eslint-disable-next-line n/no-unsupported-features/node-builtins
          }) as unknown as Response,
      );

      await expect(
        supervisor.handleMessage({
          id: 'v0:0',
          payload: {
            method: VatCommandMethod.loadUserCode,
            params: {
              bundleSpec: 'http://example.com/bundle.js',
              parameters: {},
            },
          },
        }),
      ).rejects.toThrow('Vat object must have a .name property');
    });
  });
});
