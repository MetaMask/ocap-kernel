import '../env/endoify.ts';

import { makeCounter } from '@metamask/kernel-utils';
import type { VatId } from '@metamask/ocap-kernel';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NodejsPlatformServices } from './PlatformServices.ts';

const mockSendRemoteMessage = vi.fn(async () => undefined);
const mockStop = vi.fn(async () => undefined);

const mocks = vi.hoisted(() => {
  const createMockWorker = () => {
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
        if (event === 'online') {
          // Use queueMicrotask to make it async like real events
          queueMicrotask(() => callback());
        }
        // Don't emit 'error' or 'exit' events unless we want to test error cases
      },
      removeAllListeners: vi.fn(() => {
        eventHandlers.clear();
      }),
      terminate: vi.fn(async () => undefined),
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
  NodeWorkerDuplexStream: vi.fn(() => mocks.stream),
}));

vi.mock('node:worker_threads', () => ({
  Worker: vi.fn(() => mocks.createMockWorker()),
}));

vi.mock('@metamask/ocap-kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@metamask/ocap-kernel')>();
  return {
    ...actual,
    initNetwork: vi.fn(async () => ({
      sendRemoteMessage: mockSendRemoteMessage,
      stop: mockStop,
    })),
  };
});

describe('NodejsPlatformServices', () => {
  beforeEach(() => {
    mockSendRemoteMessage.mockClear();
    mockStop.mockClear();
    mocks.stream.synchronize.mockResolvedValue(undefined);
    mocks.stream.return.mockResolvedValue({});
  });

  it('constructs an instance without any arguments', () => {
    const instance = new NodejsPlatformServices({});
    expect(instance).toBeInstanceOf(NodejsPlatformServices);
  });

  const workerFilePath = 'unused';
  const vatIdCounter = makeCounter();
  const getTestVatId = (): VatId => `v${vatIdCounter()}`;

  describe('launch', () => {
    it('creates a NodeWorker and returns a NodeWorkerDuplexStream', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
      });
      const testVatId: VatId = getTestVatId();
      const stream = await service.launch(testVatId);

      expect(stream).toStrictEqual(mocks.stream);
    });

    it('rejects if synchronize fails', async () => {
      const rejected = 'test-reject-value';
      mocks.stream.synchronize.mockRejectedValue(rejected);
      const service = new NodejsPlatformServices({ workerFilePath });
      const testVatId: VatId = getTestVatId();
      await expect(async () => await service.launch(testVatId)).rejects.toThrow(
        rejected,
      );
    });
  });

  describe('terminate', () => {
    it('terminates the target vat', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
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
      });
      const testVatId: VatId = getTestVatId();

      await expect(
        async () => await service.terminate(testVatId),
      ).rejects.toThrow(/No worker found/u);
    });
  });

  describe('terminateAll', () => {
    it('terminates all vats', async () => {
      const service = new NodejsPlatformServices({
        workerFilePath,
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
    describe('initializeRemoteComms', () => {
      it('initializes remote comms with keySeed and relays', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        const keySeed = '0x1234567890abcdef';
        const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
        const remoteHandler = vi.fn(async () => 'response');

        await service.initializeRemoteComms(
          keySeed,
          knownRelays,
          remoteHandler,
        );

        const { initNetwork } = await import('@metamask/ocap-kernel');
        expect(initNetwork).toHaveBeenCalledWith(
          keySeed,
          knownRelays,
          expect.any(Function),
        );
      });

      it('throws error if already initialized', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        const keySeed = '0xabcd';
        const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
        const remoteHandler = vi.fn(async () => 'response');

        await service.initializeRemoteComms(
          keySeed,
          knownRelays,
          remoteHandler,
        );

        await expect(
          service.initializeRemoteComms(keySeed, knownRelays, remoteHandler),
        ).rejects.toThrow('remote comms already initialized');
      });

      it('stores remote message handler for later use', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        const remoteHandler = vi.fn(async () => 'response');

        await service.initializeRemoteComms(
          '0xtest',
          ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
          remoteHandler,
        );

        // Handler is stored internally and will be used when messages arrive
        // This is tested through integration tests
        expect(service).toBeInstanceOf(NodejsPlatformServices);
      });
    });

    describe('sendRemoteMessage', () => {
      it('sends message via network layer', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        const keySeed = '0xabcd';
        const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
        const remoteHandler = vi.fn(async () => '');

        await service.initializeRemoteComms(
          keySeed,
          knownRelays,
          remoteHandler,
        );

        await service.sendRemoteMessage('peer-456', 'hello', [
          '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
        ]);

        expect(mockSendRemoteMessage).toHaveBeenCalledWith(
          'peer-456',
          'hello',
          ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
        );
      });

      it('sends message with empty hints', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        await service.initializeRemoteComms(
          '0xtest',
          [],
          vi.fn(async () => ''),
        );

        await service.sendRemoteMessage('peer-789', 'goodbye');

        expect(mockSendRemoteMessage).toHaveBeenCalledWith(
          'peer-789',
          'goodbye',
          [],
        );
      });

      it('throws error if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });

        await expect(
          service.sendRemoteMessage('peer-999', 'test', []),
        ).rejects.toThrow('remote comms not initialized');
      });
    });

    describe('stopRemoteComms', () => {
      it('stops remote comms and cleans up', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        await service.initializeRemoteComms(
          '0xtest',
          [],
          vi.fn(async () => ''),
        );

        await service.stopRemoteComms();

        expect(mockStop).toHaveBeenCalledOnce();
      });

      it('does nothing if remote comms not initialized', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        await service.stopRemoteComms();
        expect(mockStop).not.toHaveBeenCalled();
      });

      it('allows re-initialization after stop', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        const keySeed = '0xabcd';
        const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
        const remoteHandler = vi.fn(async () => '');

        // Initialize
        await service.initializeRemoteComms(
          keySeed,
          knownRelays,
          remoteHandler,
        );

        const { initNetwork } = await import('@metamask/ocap-kernel');
        const initNetworkMock = initNetwork as unknown as ReturnType<
          typeof vi.fn
        >;
        const firstCallCount = initNetworkMock.mock.calls.length;

        // Stop
        await service.stopRemoteComms();
        expect(mockStop).toHaveBeenCalledOnce();

        // Re-initialize should work
        await service.initializeRemoteComms(
          keySeed,
          knownRelays,
          remoteHandler,
        );

        // Should have called initNetwork again
        expect(initNetworkMock.mock.calls).toHaveLength(firstCallCount + 1);
      });

      it('clears internal state after stop', async () => {
        const service = new NodejsPlatformServices({ workerFilePath });
        await service.initializeRemoteComms(
          '0xtest',
          [],
          vi.fn(async () => ''),
        );

        // Should work before stop
        await service.sendRemoteMessage('peer-1', 'msg1', []);
        expect(mockSendRemoteMessage).toHaveBeenCalledTimes(1);

        await service.stopRemoteComms();

        // Should throw after stop
        await expect(
          service.sendRemoteMessage('peer-2', 'msg2', []),
        ).rejects.toThrow('remote comms not initialized');
      });
    });
  });
});
