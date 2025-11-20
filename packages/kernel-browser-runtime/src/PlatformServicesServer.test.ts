import {
  VatAlreadyExistsError,
  VatNotFoundError,
} from '@metamask/kernel-errors';
import { delay } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import type { VatConfig, VatId } from '@metamask/ocap-kernel';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';
import { makeMockMessageTarget } from '@ocap/repo-tools/test-utils';
import { TestDuplexStream } from '@ocap/repo-tools/test-utils/streams';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';

import { PlatformServicesServer } from './PlatformServicesServer.ts';
import type {
  VatWorker,
  PlatformServicesStream,
} from './PlatformServicesServer.ts';

// Mock initNetwork from ocap-kernel
const mockSendRemoteMessage = vi.fn(async () => undefined);
const mockStop = vi.fn(async () => undefined);
const mockCloseConnection = vi.fn(async () => undefined);
const mockReconnectPeer = vi.fn(async () => undefined);

vi.mock('@metamask/ocap-kernel', () => ({
  PlatformServicesCommandMethod: {
    launch: 'launch',
    terminate: 'terminate',
    terminateAll: 'terminateAll',
  },
  initNetwork: vi.fn(async () => ({
    sendRemoteMessage: mockSendRemoteMessage,
    stop: mockStop,
    closeConnection: mockCloseConnection,
    reconnectPeer: mockReconnectPeer,
  })),
}));

const makeVatConfig = (sourceSpec = 'bogus.js'): VatConfig => ({
  sourceSpec,
});

const makeMessageEvent = (
  messageId: `m${number}`,
  payload: Pick<JsonRpcRequest, 'method' | 'params'>,
): MessageEvent<JsonRpcRequest> =>
  new MessageEvent('message', {
    data: { ...payload, id: messageId, jsonrpc: '2.0' },
  });

const makeLaunchMessageEvent = (
  messageId: `m${number}`,
  vatId: VatId,
  sourceSpec = 'bogus.js',
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'launch',
    params: { vatId, vatConfig: makeVatConfig(sourceSpec) },
  });

const makeTerminateMessageEvent = (
  messageId: `m${number}`,
  vatId: VatId,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'terminate',
    params: { vatId },
  });

const makeTerminateAllMessageEvent = (messageId: `m${number}`): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'terminateAll',
    params: [],
  });

const makeInitializeRemoteCommsMessageEvent = (
  messageId: `m${number}`,
  keySeed: string,
  knownRelays: string[],
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'initializeRemoteComms',
    params: { keySeed, knownRelays },
  });

const makeSendRemoteMessageMessageEvent = (
  messageId: `m${number}`,
  to: string,
  message: string,
  hints: string[],
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'sendRemoteMessage',
    params: { to, message, hints },
  });

const makeStopRemoteCommsMessageEvent = (
  messageId: `m${number}`,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'stopRemoteComms',
    params: [],
  });

const makeCloseConnectionMessageEvent = (
  messageId: `m${number}`,
  peerId: string,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'closeConnection',
    params: { peerId },
  });

const makeReconnectPeerMessageEvent = (
  messageId: `m${number}`,
  peerId: string,
  hints: string[] = [],
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'reconnectPeer',
    params: { peerId, hints },
  });

describe('PlatformServicesServer', () => {
  let cleanup: (() => Promise<void>)[] = [];

  beforeEach(() => {
    cleanup = [];
  });

  afterEach(async () => {
    for (const cleanupFn of cleanup) {
      await cleanupFn();
    }
  });

  // Add cleanup function for each worker/stream created
  const addCleanup = (fn: () => Promise<void>): void => {
    cleanup.push(fn);
  };

  it('constructs with default logger', async () => {
    const stream = await TestDuplexStream.make(() => undefined);
    await stream.synchronize();
    const server = new PlatformServicesServer(
      stream as unknown as PlatformServicesStream,
      () => ({}) as unknown as VatWorker,
    );
    expect(server).toBeDefined();
  });

  it('constructs using static factory method', async () => {
    const server = await PlatformServicesServer.make(
      makeMockMessageTarget(),
      () => ({}) as unknown as VatWorker,
    );
    expect(server).toBeDefined();
  });

  describe('message handling', () => {
    let workers: ReturnType<typeof makeMockVatWorker>[] = [];
    let stream: TestDuplexStream;
    let logger: Logger;

    const makeMockVatWorker = (
      _id: string,
    ): {
      launch: Mock;
      terminate: Mock;
    } => {
      const worker = {
        launch: vi.fn().mockResolvedValue([
          // Mock MessagePort
          {} as MessagePort,
          // Mock window/iframe reference
          {},
        ]),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      workers.push(worker);
      return worker;
    };

    beforeEach(async () => {
      workers = [];
      logger = new Logger('test-server');
      stream = await TestDuplexStream.make(() => undefined);
      await stream.synchronize();
      // eslint-disable-next-line no-new
      new PlatformServicesServer(
        stream as unknown as PlatformServicesStream,
        makeMockVatWorker,
        logger,
      );

      addCleanup(async () => {
        await stream.return?.();
      });
    });

    it('logs an error for unexpected methods', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      await stream.receiveInput(makeMessageEvent('m0', { method: 'foo' }));
      await delay(10);

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error handling "foo" request:',
        rpcErrors.methodNotFound(),
      );
    });

    describe('launch', () => {
      it('launches a vat', async () => {
        const vatId = 'v0';
        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.launch).toHaveBeenCalledOnce();
        expect(workers[0]?.launch).toHaveBeenCalledWith(makeVatConfig());
      });

      it('logs error if a vat with the same id already exists', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        await stream.receiveInput(makeLaunchMessageEvent('m0', 'v0'));
        await stream.receiveInput(makeLaunchMessageEvent('m1', 'v0'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          'Error handling "launch" request:',
          new VatAlreadyExistsError('v0'),
        );
      });
    });

    describe('terminate', () => {
      it('terminates a vat', async () => {
        const vatId = 'v0';
        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.terminate).not.toHaveBeenCalled();

        await stream.receiveInput(makeTerminateMessageEvent('m1', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.terminate).toHaveBeenCalledOnce();
        expect(workers[0]?.terminate).toHaveBeenCalledWith();
      });

      it('logs error if a vat with the specified id does not exist', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        await stream.receiveInput(makeTerminateMessageEvent('m0', 'v0'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          'Error handling "terminate" request:',
          new VatNotFoundError('v0'),
        );
      });

      it('logs error if a vat fails to terminate', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        const vatId = 'v0';
        const vatNotFoundError = new VatNotFoundError(vatId);

        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        workers[0]?.terminate.mockRejectedValue(vatNotFoundError);

        await stream.receiveInput(makeTerminateMessageEvent('m1', vatId));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          'Error handling "terminate" request:',
          vatNotFoundError,
        );
      });
    });

    describe('terminateAll', () => {
      it('terminates all vats', async () => {
        await stream.receiveInput(
          makeLaunchMessageEvent('m0', 'v0', 'bogus1.js'),
        );
        await stream.receiveInput(
          makeLaunchMessageEvent('m1', 'v1', 'bogus2.js'),
        );
        await delay(10);

        expect(workers).toHaveLength(2);
        expect(workers[0]?.terminate).not.toHaveBeenCalled();
        expect(workers[1]?.terminate).not.toHaveBeenCalled();

        await stream.receiveInput(makeTerminateAllMessageEvent('m2'));
        await delay(10);

        expect(workers).toHaveLength(2);
        expect(workers[0]?.terminate).toHaveBeenCalledOnce();
        expect(workers[1]?.terminate).toHaveBeenCalledOnce();
      });

      it('logs error if a vat fails to terminate', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        const vatId = 'v0';
        const vatNotFoundError = new VatNotFoundError(vatId);

        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        workers[0]?.terminate.mockRejectedValue(vatNotFoundError);

        await stream.receiveInput(makeTerminateAllMessageEvent('m1'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy).toHaveBeenCalledWith(
          'Error handling "terminateAll" request:',
          vatNotFoundError,
        );
      });
    });

    describe('remote communications', () => {
      beforeEach(() => {
        // Reset mocks before each test
        mockSendRemoteMessage.mockClear();
        mockStop.mockClear();
        mockCloseConnection.mockClear();
        mockReconnectPeer.mockClear();
      });

      describe('initializeRemoteComms', () => {
        it('initializes remote comms with keySeed and relays', async () => {
          const keySeed = '0x1234567890abcdef';
          const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, knownRelays),
          );
          await delay(10);

          const { initNetwork } = await import('@metamask/ocap-kernel');
          expect(initNetwork).toHaveBeenCalledWith(
            keySeed,
            knownRelays,
            expect.any(Function),
          );
        });

        it('throws error if already initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');
          const keySeed = '0xabcd';
          const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          // First initialization
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, knownRelays),
          );
          await delay(10);

          // Second initialization should fail
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m1', keySeed, knownRelays),
          );
          await delay(10);

          expect(errorSpy).toHaveBeenCalledWith(
            'Error handling "initializeRemoteComms" request:',
            expect.objectContaining({
              message: 'remote comms already initialized',
            }),
          );
        });
      });

      describe('sendRemoteMessage', () => {
        it('sends message via network layer', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          // Now send a message
          await stream.receiveInput(
            makeSendRemoteMessageMessageEvent('m1', 'peer-123', 'hello', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          expect(mockSendRemoteMessage).toHaveBeenCalledWith(
            'peer-123',
            'hello',
            ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
          );
        });

        it('throws error if remote comms not initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');

          await stream.receiveInput(
            makeSendRemoteMessageMessageEvent('m0', 'peer-456', 'test', []),
          );
          await delay(10);

          expect(errorSpy).toHaveBeenCalledWith(
            'Error handling "sendRemoteMessage" request:',
            expect.objectContaining({
              message: 'remote comms not initialized',
            }),
          );
        });
      });

      describe('stopRemoteComms', () => {
        it('stops remote comms and cleans up', async () => {
          // First initialize
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          // Now stop
          await stream.receiveInput(makeStopRemoteCommsMessageEvent('m1'));
          await delay(10);

          expect(mockStop).toHaveBeenCalledOnce();
        });

        it('does nothing if remote comms not initialized', async () => {
          await stream.receiveInput(makeStopRemoteCommsMessageEvent('m0'));
          await delay(10);
          expect(mockStop).not.toHaveBeenCalled();
        });

        it('allows re-initialization after stop', async () => {
          const keySeed = '0xabcd';
          const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          // Initialize
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, knownRelays),
          );
          await delay(10);

          // Stop
          await stream.receiveInput(makeStopRemoteCommsMessageEvent('m1'));
          await delay(10);

          const { initNetwork } = await import('@metamask/ocap-kernel');
          const firstCallCount = (initNetwork as Mock).mock.calls.length;

          // Re-initialize should work
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m2', keySeed, knownRelays),
          );
          await delay(10);

          // Should have called initNetwork again
          expect((initNetwork as Mock).mock.calls).toHaveLength(
            firstCallCount + 1,
          );
        });
      });

      describe('closeConnection', () => {
        it('closes connection via network layer', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          // Now close connection
          await stream.receiveInput(
            makeCloseConnectionMessageEvent('m1', 'peer-123'),
          );
          await delay(10);

          expect(mockCloseConnection).toHaveBeenCalledWith('peer-123');
        });

        it('throws error if remote comms not initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');

          await stream.receiveInput(
            makeCloseConnectionMessageEvent('m0', 'peer-456'),
          );
          await delay(10);

          expect(errorSpy).toHaveBeenCalledWith(
            'Error handling "closeConnection" request:',
            expect.objectContaining({
              message: 'remote comms not initialized',
            }),
          );
        });
      });

      describe('reconnectPeer', () => {
        it('reconnects peer via network layer', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          // Now reconnect peer
          await stream.receiveInput(
            makeReconnectPeerMessageEvent('m1', 'peer-456', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          expect(mockReconnectPeer).toHaveBeenCalledWith('peer-456', [
            '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
          ]);
        });

        it('reconnects peer with empty hints', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', [
              '/dns4/relay.example/tcp/443/wss/p2p/relayPeer',
            ]),
          );
          await delay(10);

          // Now reconnect peer with empty hints
          await stream.receiveInput(
            makeReconnectPeerMessageEvent('m1', 'peer-789'),
          );
          await delay(10);

          expect(mockReconnectPeer).toHaveBeenCalledWith('peer-789', []);
        });

        it('throws error if remote comms not initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');

          await stream.receiveInput(
            makeReconnectPeerMessageEvent('m0', 'peer-999'),
          );
          await delay(10);

          expect(errorSpy).toHaveBeenCalledWith(
            'Error handling "reconnectPeer" request:',
            expect.objectContaining({
              message: 'remote comms not initialized',
            }),
          );
        });
      });
    });
  });
});
