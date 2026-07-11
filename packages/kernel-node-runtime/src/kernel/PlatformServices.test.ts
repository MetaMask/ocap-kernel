import { makeCounter } from '@metamask/kernel-utils';
import type { VatId } from '@metamask/ocap-kernel';
import { Worker as NodeWorker } from 'node:worker_threads';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NodejsPlatformServices } from './PlatformServices.ts';

const mockSendRemoteMessage = vi.fn(async () => undefined);
const mockStop = vi.fn(async () => undefined);
const mockCloseConnection = vi.fn(async () => undefined);
const mockRegisterLocationHints = vi.fn(async () => undefined);
const mockReconnectPeer = vi.fn(async () => undefined);

const mocks = vi.hoisted(() => {
  const createMockWorker = (autoEmitOnline = true) => {
    const eventHandlers = new Map<
      string,
      ((...args: unknown[]) => unknown)[]
    >();
    return {
      once: (event: string, callback: (...args: unknown[]) => unknown) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        const handlers = eventHandlers.get(event);
        if (handlers) {
          handlers.push(callback);
        }
        // Immediately emit 'online' event to simulate worker coming online
        if (event === 'online' && autoEmitOnline) {
          // Use queueMicrotask to make it async like real events
          queueMicrotask(() => callback());
        }
        // Don't emit 'error' or 'exit' events unless we want to test error cases
      },
      removeAllListeners: vi.fn((event?: string) => {
        if (event) {
          eventHandlers.delete(event);
        } else {
          eventHandlers.clear();
        }
      }),
      terminate: vi.fn(async () => undefined),
      // Helper method to manually emit events for testing
      emit: (event: string, ...args: unknown[]) => {
        const handlers = eventHandlers.get(event);
        if (handlers) {
          handlers.forEach((handler) => {
            handler(...args);
          });
        }
      },
    };
  };
  return {
    createMockWorker,
    stream: {
      synchronize: vi.fn(async () => undefined).mockResolvedValue(undefined),
      return: vi.fn(async () => ({})),
    },
  };
});

vi.mock('@metamask/streams', () => ({
  NodeWorkerDuplexStream: vi.fn(function () {
    return mocks.stream;
  }),
}));

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(function () {
    return mocks.createMockWorker();
  }),
}));

const mockGetListenAddresses = vi.fn(() => [
  '/ip4/127.0.0.1/udp/12345/quic-v1/p2p/mock-peer-id',
]);

// A fake netlayer factory (registry entry) capturing the params it receives.
const fakeNetlayerFactory = vi.fn(async () => ({
  sendRemoteMessage: mockSendRemoteMessage,
  stop: mockStop,
  closeConnection: mockCloseConnection,
  registerLocationHints: mockRegisterLocationHints,
  reconnectPeer: mockReconnectPeer,
  resetAllBackoffs: vi.fn(),
  getListenAddresses: mockGetListenAddresses,
}));

const netlayers = {
  libp2p: fakeNetlayerFactory,
} as unknown as ConstructorParameters<
  typeof NodejsPlatformServices
>[0]['netlayers'];

describe('NodejsPlatformServices', () => {
  beforeEach(() => {
    mockSendRemoteMessage.mockClear();
    mockStop.mockClear();
    mockCloseConnection.mockClear();
    mockRegisterLocationHints.mockClear();
    mockReconnectPeer.mockClear();
    mocks.stream.synchronize.mockResolvedValue(undefined);
    mocks.stream.return.mockResolvedValue({});
  });

  it('constructs an instance without any arguments', () => {
    const instance = new NodejsPlatformServices({ netlayers });
    expect(instance).toBeInstanceOf(NodejsPlatformServices);
  });

  const workerFilePath = 'unused';
  const vatIdCounter = makeCounter();
  const getTestVatId = (): VatId => `v${vatIdCounter()}`;

  describe('launch', () => {
    it('creates a NodeWorker and returns a NodeWorkerDuplexStream', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
        netlayers,
      });
      const testVatId: VatId = getTestVatId();
      const stream = await service.launch(testVatId);

      expect(stream).toStrictEqual(mocks.stream);
    });

    it('rejects if synchronize fails', async () => {
      const rejected = 'test-reject-value';
      mocks.stream.synchronize.mockRejectedValue(rejected);
      const service = new NodejsPlatformServices({ workerFilePath, netlayers });
      const testVatId: VatId = getTestVatId();
      await expect(service.launch(testVatId)).rejects.toThrowError(rejected);
    });

    it('throws error if worker already exists', async () => {
      const service = new NodejsPlatformServices({ workerFilePath, netlayers });
      const testVatId: VatId = getTestVatId();

      await service.launch(testVatId);
      expect(service.workers.has(testVatId)).toBe(true);

      await expect(service.launch(testVatId)).rejects.toThrowError(
        `Worker ${testVatId} already exists! Cannot launch duplicate.`,
      );
    });

    it('rejects if worker errors during startup', async () => {
      const service = new NodejsPlatformServices({ workerFilePath, netlayers });
      const testVatId: VatId = getTestVatId();

      // Create a worker that won't auto-emit 'online' (for error testing)
      const worker = mocks.createMockWorker(false);
      vi.mocked(NodeWorker).mockImplementationOnce(function () {
        return worker;
      });

      const launchPromise = service.launch(testVatId);

      // Wait a tick to ensure handlers are registered
      await Promise.resolve();

      // Emit error event before 'online'
      worker.emit('error', new Error('worker startup error'));

      await expect(launchPromise).rejects.toThrowError(
        `Worker ${testVatId} errored during startup: worker startup error`,
      );
      expect(service.workers.has(testVatId)).toBe(false);
      expect(worker.terminate).toHaveBeenCalled();
    });

    it('rejects if worker exits during startup', async () => {
      const service = new NodejsPlatformServices({ workerFilePath, netlayers });
      const testVatId: VatId = getTestVatId();

      // Create a worker that won't auto-emit 'online' (for exit testing)
      const worker = mocks.createMockWorker(false);
      vi.mocked(NodeWorker).mockImplementationOnce(function () {
        return worker;
      });

      const launchPromise = service.launch(testVatId);

      // Wait a tick to ensure handlers are registered
      await Promise.resolve();

      // Emit exit event before 'online'
      worker.emit('exit', 1);

      await expect(launchPromise).rejects.toThrowError(
        `Worker ${testVatId} exited during startup with code 1`,
      );
      expect(service.workers.has(testVatId)).toBe(false);
    });
  });

  describe('terminate', () => {
    it('terminates the target vat', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
        netlayers,
      });
      const testVatId: VatId = getTestVatId();

      await service.launch(testVatId);
      expect(service.workers.has(testVatId)).toBe(true);

      await service.terminate(testVatId);
      expect(service.workers.has(testVatId)).toBe(false);
    });

    it('throws when terminating an unknown vat', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
        netlayers,
      });
      const testVatId: VatId = getTestVatId();

      await expect(service.terminate(testVatId)).rejects.toThrowError(
        /No worker found/u,
      );
    });
  });

  describe('terminateAll', () => {
    it('terminates all vats', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
        netlayers,
      });
      const vatIds: VatId[] = [getTestVatId(), getTestVatId(), getTestVatId()];

      await Promise.all(
        vatIds.map(async (vatId) => await service.launch(vatId)),
      );

      expect(Array.from(service.workers.values())).toHaveLength(vatIds.length);

      await service.terminateAll();

      expect(Array.from(service.workers.values())).toHaveLength(0);
    });
  });

  describe('remote communications', () => {
    const specifier = {
      netlayer: 'libp2p',
      config: {
        knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
      },
    };
    const makeInit = (
      overrides: Record<string, unknown> = {},
    ): Parameters<NodejsPlatformServices['initializeRemoteComms']>[0] => ({
      keySeed: '0x1234567890abcdef',
      specifier,
      hooks: { handleMessage: vi.fn(async () => 'response') },
      ...overrides,
    });

    describe('initializeRemoteComms', () => {
      it('looks up the netlayer factory with the keySeed, config, and hooks', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());

        expect(fakeNetlayerFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            keySeed: '0x1234567890abcdef',
            config: specifier.config,
            hooks: expect.objectContaining({
              handleMessage: expect.any(Function),
            }),
          }),
        );
      });

      it('forwards incarnationId and callbacks through the hooks', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        const onRemoteGiveUp = vi.fn();
        const onIncarnationChange = vi.fn(async () => true);
        await service.initializeRemoteComms(
          makeInit({
            hooks: {
              handleMessage: vi.fn(async () => 'response'),
              onRemoteGiveUp,
              onIncarnationChange,
            },
            incarnationId: 'test-incarnation-id',
          }),
        );

        expect(fakeNetlayerFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            incarnationId: 'test-incarnation-id',
            hooks: expect.objectContaining({
              onRemoteGiveUp,
              onIncarnationChange,
            }),
          }),
        );
      });

      it('throws for an unknown netlayer', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await expect(
          service.initializeRemoteComms(
            makeInit({ specifier: { netlayer: 'nope', config: {} } }),
          ),
        ).rejects.toThrow('Unknown netlayer: "nope"');
      });

      it('throws error if already initialized', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await expect(
          service.initializeRemoteComms(makeInit()),
        ).rejects.toThrowError('remote comms already initialized');
      });
    });

    describe('getListenAddresses', () => {
      it('returns listen addresses after initialization', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        expect(service.getListenAddresses()).toStrictEqual([
          '/ip4/127.0.0.1/udp/12345/quic-v1/p2p/mock-peer-id',
        ]);
      });

      it('returns empty array before initialization', () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        expect(service.getListenAddresses()).toStrictEqual([]);
      });
    });

    describe('sendRemoteMessage', () => {
      it('sends message via network layer', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        const message = JSON.stringify({
          method: 'deliver',
          params: ['hello'],
        });
        await service.sendRemoteMessage('peer-456', message);
        expect(mockSendRemoteMessage).toHaveBeenCalledWith('peer-456', message);
      });

      it('throws error if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await expect(
          service.sendRemoteMessage('peer-999', 'msg'),
        ).rejects.toThrowError('remote comms not initialized');
      });
    });

    describe('stopRemoteComms', () => {
      it('stops remote comms and cleans up', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.stopRemoteComms();
        expect(mockStop).toHaveBeenCalledOnce();
      });

      it('does nothing if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.stopRemoteComms();
        expect(mockStop).not.toHaveBeenCalled();
      });

      it('allows re-initialization after stop', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        const firstCallCount = fakeNetlayerFactory.mock.calls.length;
        await service.stopRemoteComms();
        expect(mockStop).toHaveBeenCalledOnce();
        await service.initializeRemoteComms(makeInit());
        expect(fakeNetlayerFactory.mock.calls).toHaveLength(firstCallCount + 1);
      });

      it('clears internal state after stop', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.sendRemoteMessage('peer-1', 'msg1');
        expect(mockSendRemoteMessage).toHaveBeenCalledTimes(1);
        await service.stopRemoteComms();
        await expect(
          service.sendRemoteMessage('peer-2', 'msg2'),
        ).rejects.toThrowError('remote comms not initialized');
      });

      it('clears closeConnection and reconnectPeer after stop', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.closeConnection('peer-1');
        await service.reconnectPeer('peer-1');
        expect(mockCloseConnection).toHaveBeenCalledTimes(1);
        expect(mockReconnectPeer).toHaveBeenCalledTimes(1);
        await service.stopRemoteComms();
        await expect(service.closeConnection('peer-2')).rejects.toThrowError(
          'remote comms not initialized',
        );
        await expect(service.reconnectPeer('peer-2')).rejects.toThrowError(
          'remote comms not initialized',
        );
      });
    });

    describe('closeConnection', () => {
      it('closes connection via network layer', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.closeConnection('peer-123');
        expect(mockCloseConnection).toHaveBeenCalledWith('peer-123');
      });

      it('throws error if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await expect(service.closeConnection('peer-999')).rejects.toThrowError(
          'remote comms not initialized',
        );
      });
    });

    describe('registerLocationHints', () => {
      it('registers location hints via network layer', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.registerLocationHints('peer-123', ['hint1', 'hint2']);
        expect(mockRegisterLocationHints).toHaveBeenCalledWith('peer-123', [
          'hint1',
          'hint2',
        ]);
      });

      it('throws error if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await expect(
          service.registerLocationHints('peer-999', ['hint1']),
        ).rejects.toThrowError('remote comms not initialized');
      });
    });

    describe('reconnectPeer', () => {
      it('reconnects peer via network layer', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.reconnectPeer('peer-456', ['/dns4/r.example/p2p/x']);
        expect(mockReconnectPeer).toHaveBeenCalledWith('peer-456', [
          '/dns4/r.example/p2p/x',
        ]);
      });

      it('reconnects peer with empty hints', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await service.initializeRemoteComms(makeInit());
        await service.reconnectPeer('peer-789');
        expect(mockReconnectPeer).toHaveBeenCalledWith('peer-789', []);
      });

      it('throws error if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({
          workerFilePath,
          netlayers,
        });
        await expect(service.reconnectPeer('peer-999')).rejects.toThrowError(
          'remote comms not initialized',
        );
      });
    });
  });
});
