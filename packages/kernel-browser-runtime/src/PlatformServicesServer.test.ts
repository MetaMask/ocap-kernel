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

// A fake netlayer factory (registry entry) that captures the hooks the server
// reconstructs locally and returns stubbed netlayer methods.
const mockSendRemoteMessage = vi.fn(async () => undefined);
const mockStop = vi.fn(async () => undefined);
const mockCloseConnection = vi.fn(async () => undefined);
const mockRegisterLocationHints = vi.fn(async () => undefined);
const mockReconnectPeer = vi.fn(async () => undefined);
const mockResetAllBackoffs = vi.fn(() => undefined);
let capturedRemoteMessageHandler:
  | ((from: string, message: string) => Promise<string>)
  | undefined;
let capturedRemoteGiveUpHandler: ((peerId: string) => void) | undefined;
let capturedOnIncarnationChange:
  | ((peerId: string, observedIncarnation: string) => Promise<boolean>)
  | undefined;

const fakeNetlayerFactory = vi.fn(
  async ({
    hooks,
  }: {
    hooks: {
      handleMessage: (from: string, message: string) => Promise<string>;
      onRemoteGiveUp?: (peerId: string) => void;
      onIncarnationChange?: (
        peerId: string,
        observedIncarnation: string,
      ) => Promise<boolean>;
    };
  }) => {
    capturedRemoteMessageHandler = hooks.handleMessage;
    capturedRemoteGiveUpHandler = hooks.onRemoteGiveUp;
    capturedOnIncarnationChange = hooks.onIncarnationChange;
    return {
      sendRemoteMessage: mockSendRemoteMessage,
      stop: mockStop,
      closeConnection: mockCloseConnection,
      registerLocationHints: mockRegisterLocationHints,
      reconnectPeer: mockReconnectPeer,
      resetAllBackoffs: mockResetAllBackoffs,
      getListenAddresses: vi.fn(() => []),
    };
  },
);

const netlayers = { libp2p: fakeNetlayerFactory } as unknown as Parameters<
  typeof PlatformServicesServer.make
>[2]['netlayers'];

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
  config: Record<string, unknown> = {},
  incarnationId?: string,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'initializeRemoteComms',
    params: {
      keySeed,
      specifier: { netlayer: 'libp2p', config },
      ...(incarnationId !== undefined && { incarnationId }),
    },
  });

const makeSendRemoteMessageMessageEvent = (
  messageId: `m${number}`,
  to: string,
  message: string,
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'sendRemoteMessage',
    params: { to, message },
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

const makeRegisterLocationHintsMessageEvent = (
  messageId: `m${number}`,
  peerId: string,
  hints: string[],
): MessageEvent =>
  makeMessageEvent(messageId, {
    method: 'registerLocationHints',
    params: { peerId, hints },
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
      { netlayers },
    );
    expect(server).toBeDefined();
  });

  it('constructs using static factory method', async () => {
    const server = await PlatformServicesServer.make(
      makeMockMessageTarget(),
      () => ({}) as unknown as VatWorker,
      { netlayers },
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
        { netlayers, logger },
      );

      addCleanup(async () => {
        await stream.return?.();
      });
    });

    it('logs an error for unexpected methods', async () => {
      const errorSpy = vi.spyOn(logger, 'error');
      await stream.receiveInput(makeMessageEvent('m0', { method: 'foo' }));
      await delay(10);

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        'Error handling "foo" request:',
        rpcErrors.methodNotFound(),
      );
    });

    it('handles JsonRpcResponse messages', async () => {
      const outputs: unknown[] = [];
      const testStream = await TestDuplexStream.make((message) => {
        outputs.push(message);
      });
      await testStream.synchronize();
      // eslint-disable-next-line no-new
      new PlatformServicesServer(
        testStream as unknown as PlatformServicesStream,
        makeMockVatWorker,
        { netlayers, logger },
      );

      // Send a response (simulating RPC client response)
      await testStream.receiveInput(
        new MessageEvent('message', {
          data: {
            id: 'vws:1',
            result: 'test-result',
            jsonrpc: '2.0',
          },
        }),
      );
      await delay(10);

      // Response should be handled without errors
      // (RPC client handles it internally)
      expect(testStream).toBeDefined();
    });

    describe('launch', () => {
      it('launches a vat', async () => {
        const vatId = 'v0';
        await stream.receiveInput(makeLaunchMessageEvent('m0', vatId));
        await delay(10);

        expect(workers).toHaveLength(1);
        expect(workers[0]?.launch).toHaveBeenCalledExactlyOnceWith(
          makeVatConfig(),
        );
      });

      it('logs error if a vat with the same id already exists', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        await stream.receiveInput(makeLaunchMessageEvent('m0', 'v0'));
        await stream.receiveInput(makeLaunchMessageEvent('m1', 'v0'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
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
        expect(workers[0]?.terminate).toHaveBeenCalledExactlyOnceWith();
      });

      it('logs error if a vat with the specified id does not exist', async () => {
        const errorSpy = vi.spyOn(logger, 'error');
        await stream.receiveInput(makeTerminateMessageEvent('m0', 'v0'));
        await delay(10);

        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
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

        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
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

        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          'Error handling "terminateAll" request:',
          vatNotFoundError,
        );
      });
    });

    describe('remote communications', () => {
      beforeEach(() => {
        // Reset mocks before each test
        capturedRemoteMessageHandler = undefined;
        capturedRemoteGiveUpHandler = undefined;
        capturedOnIncarnationChange = undefined;
      });

      describe('initializeRemoteComms', () => {
        it('looks up the netlayer factory with the keySeed and config', async () => {
          const keySeed = '0x1234567890abcdef';
          const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, {
              knownRelays,
            }),
          );
          await delay(10);

          expect(fakeNetlayerFactory).toHaveBeenCalledWith(
            expect.objectContaining({
              keySeed,
              config: { knownRelays },
              hooks: expect.objectContaining({
                handleMessage: expect.any(Function),
                onRemoteGiveUp: expect.any(Function),
                onIncarnationChange: expect.any(Function),
              }),
            }),
          );
        });

        it('passes the full config through to the factory', async () => {
          const keySeed = '0x1234567890abcdef';
          const config = {
            knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            maxRetryAttempts: 5,
            maxMessageSizeBytes: 100,
          };

          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, config),
          );
          await delay(10);

          expect(fakeNetlayerFactory).toHaveBeenCalledWith(
            expect.objectContaining({ keySeed, config }),
          );
        });

        it('throws for an unknown netlayer', async () => {
          const errorSpy = vi.spyOn(logger, 'error');
          await stream.receiveInput(
            makeMessageEvent('m0', {
              method: 'initializeRemoteComms',
              params: {
                keySeed: '0xabcd',
                specifier: { netlayer: 'nope', config: {} },
              },
            }),
          );
          await delay(10);

          expect(errorSpy).toHaveBeenCalledWith(
            'Error handling "initializeRemoteComms" request:',
            expect.objectContaining({
              message: 'Unknown netlayer: "nope"',
            }),
          );
        });

        it('throws error if already initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          // First initialization
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, { relays }),
          );
          await delay(10);

          // Second initialization should fail
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m1', keySeed, { relays }),
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

      describe('handleRemoteMessage', () => {
        it('captures handler from initTransport', async () => {
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, { relays }),
          );
          await delay(10);

          // Handler should be captured
          expect(capturedRemoteMessageHandler).toBeDefined();
          expect(typeof capturedRemoteMessageHandler).toBe('function');
        });

        it('sends RPC call for remoteDeliver when handler is called', async () => {
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          // Capture RPC calls through stream
          const outputs: unknown[] = [];
          const testStream = await TestDuplexStream.make((message) => {
            outputs.push(message);
          });
          await testStream.synchronize();
          // eslint-disable-next-line no-new
          new PlatformServicesServer(
            testStream as unknown as PlatformServicesStream,
            makeMockVatWorker,
            { netlayers, logger },
          );
          await testStream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m1', keySeed, { relays }),
          );
          await delay(10);

          // Handler should be captured and callable
          expect(capturedRemoteMessageHandler).toBeDefined();
          expect(typeof capturedRemoteMessageHandler).toBe('function');

          // Call handler - it will send RPC request
          const handlerPromise = capturedRemoteMessageHandler?.(
            'peer-123',
            'test-message',
          );

          await delay(10);

          // Should have sent remoteDeliver RPC request
          const remoteDeliverCall = outputs.find((outputMessage: unknown) => {
            const parsedMessage = outputMessage as {
              payload?: { method?: string };
            };
            return parsedMessage.payload?.method === 'remoteDeliver';
          });
          expect(remoteDeliverCall).toBeDefined();

          // Mock response to complete the handler call
          await testStream.receiveInput(
            new MessageEvent('message', {
              data: {
                id: 'vws:1',
                result: null,
                jsonrpc: '2.0',
              },
            }),
          );
          await handlerPromise;
        });
      });

      describe('handleRemoteIncarnationChange', () => {
        it('forwards observed incarnation to RPC and resolves to the kernel verdict', async () => {
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          const outputs: unknown[] = [];
          const testStream = await TestDuplexStream.make((message) => {
            outputs.push(message);
          });
          await testStream.synchronize();
          // eslint-disable-next-line no-new
          new PlatformServicesServer(
            testStream as unknown as PlatformServicesStream,
            makeMockVatWorker,
            { netlayers, logger },
          );
          await testStream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, { relays }),
          );
          await delay(10);

          expect(capturedOnIncarnationChange).toBeDefined();

          // Fire the handler and have the "kernel" respond with `true`.
          const verdict = capturedOnIncarnationChange?.(
            'peer-789',
            'incarnation-X',
          );
          await delay(10);

          // Find the outgoing RPC and respond.
          const rpcCall = outputs.find((message: unknown) => {
            const parsed = message as { payload?: { method?: string } };
            return parsed.payload?.method === 'remoteIncarnationChange';
          }) as { payload: { method: string; id: string; params: unknown } };
          expect(rpcCall).toBeDefined();
          expect(rpcCall.payload.params).toStrictEqual({
            peerId: 'peer-789',
            observedIncarnation: 'incarnation-X',
          });

          // Stub the RPC response with verdict=true.
          await testStream.receiveInput(
            new MessageEvent('message', {
              data: { id: rpcCall.payload.id, result: true, jsonrpc: '2.0' },
            }),
          );
          expect(await verdict).toBe(true);
        });

        it('returns true (fail closed) when the RPC call rejects', async () => {
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          const outputs: unknown[] = [];
          const testStream = await TestDuplexStream.make((message) => {
            outputs.push(message);
          });
          await testStream.synchronize();
          // eslint-disable-next-line no-new
          new PlatformServicesServer(
            testStream as unknown as PlatformServicesStream,
            makeMockVatWorker,
            { netlayers, logger },
          );
          await testStream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, { relays }),
          );
          await delay(10);

          const verdict = capturedOnIncarnationChange?.(
            'peer-789',
            'incarnation-Y',
          );
          await delay(10);

          // Reject the RPC.
          const rpcCall = outputs.find((message: unknown) => {
            const parsed = message as { payload?: { method?: string } };
            return parsed.payload?.method === 'remoteIncarnationChange';
          }) as { payload: { method: string; id: string } };
          expect(rpcCall).toBeDefined();
          await testStream.receiveInput(
            new MessageEvent('message', {
              data: {
                id: rpcCall.payload.id,
                error: { code: -32000, message: 'kernel unreachable' },
                jsonrpc: '2.0',
              },
            }),
          );

          // Fail closed → resolve to true so transport drops the outbound.
          expect(await verdict).toBe(true);
        });
      });

      describe('handleRemoteGiveUp', () => {
        it('captures handler from initTransport', async () => {
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, { relays }),
          );
          await delay(10);

          // Handler should be captured
          expect(capturedRemoteGiveUpHandler).toBeDefined();
          expect(typeof capturedRemoteGiveUpHandler).toBe('function');
        });

        it('sends RPC call for remoteGiveUp when handler is called', async () => {
          const keySeed = '0xabcd';
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          // Capture RPC calls through stream
          const outputs: unknown[] = [];
          const testStream = await TestDuplexStream.make((message) => {
            outputs.push(message);
          });
          await testStream.synchronize();
          // eslint-disable-next-line no-new
          new PlatformServicesServer(
            testStream as unknown as PlatformServicesStream,
            makeMockVatWorker,
            { netlayers, logger },
          );
          await testStream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m1', keySeed, { relays }),
          );
          await delay(10);

          // Handler should be captured and callable
          expect(capturedRemoteGiveUpHandler).toBeDefined();
          expect(typeof capturedRemoteGiveUpHandler).toBe('function');

          capturedRemoteGiveUpHandler?.('peer-789');
          await delay(10);

          // Should have sent remoteGiveUp RPC call
          const remoteGiveUpCall = outputs.find((outputMessage: unknown) => {
            const parsedMessage = outputMessage as {
              payload?: { method?: string };
            };
            return parsedMessage.payload?.method === 'remoteGiveUp';
          });
          expect(remoteGiveUpCall).toBeDefined();
        });
      });

      describe('sendRemoteMessage', () => {
        it('sends message via network layer', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {
              relays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            }),
          );
          await delay(10);

          // Now send a message (message is already serialized as a string)
          const message = JSON.stringify({
            method: 'deliver',
            params: ['hello'],
          });
          await stream.receiveInput(
            makeSendRemoteMessageMessageEvent('m1', 'peer-123', message),
          );
          await delay(10);

          expect(mockSendRemoteMessage).toHaveBeenCalledWith(
            'peer-123',
            message,
          );
        });

        it('throws error if remote comms not initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');

          await stream.receiveInput(
            makeSendRemoteMessageMessageEvent(
              'm0',
              'peer-456',
              JSON.stringify({ method: 'deliver', params: ['test'] }),
            ),
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
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {
              relays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            }),
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
          const relays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];

          // Initialize
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', keySeed, { relays }),
          );
          await delay(10);

          // Stop
          await stream.receiveInput(makeStopRemoteCommsMessageEvent('m1'));
          await delay(10);

          const firstCallCount = fakeNetlayerFactory.mock.calls.length;

          // Re-initialize should work
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m2', keySeed, { relays }),
          );
          await delay(10);

          // Should have called the netlayer factory again
          expect(fakeNetlayerFactory.mock.calls).toHaveLength(
            firstCallCount + 1,
          );
        });
      });

      describe('closeConnection', () => {
        it('closes connection via network layer', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {
              relays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            }),
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

      describe('registerLocationHints', () => {
        it('registers location hints via network layer', async () => {
          // First initialize remote comms
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {
              relays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            }),
          );
          await delay(10);

          // Now register some hints
          await stream.receiveInput(
            makeRegisterLocationHintsMessageEvent('m1', 'peer-123', [
              'hint1',
              'hint2',
            ]),
          );
          await delay(10);

          expect(mockRegisterLocationHints).toHaveBeenCalledWith('peer-123', [
            'hint1',
            'hint2',
          ]);
        });

        it('throws error if remote comms not initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');

          await stream.receiveInput(
            makeRegisterLocationHintsMessageEvent('m0', 'peer-456', [
              'hint1',
              'hint2',
            ]),
          );
          await delay(10);

          expect(errorSpy).toHaveBeenCalledWith(
            'Error handling "registerLocationHints" request:',
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
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {
              relays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            }),
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
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {
              relays: ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'],
            }),
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

      describe('resetAllBackoffs', () => {
        it('is a no-op before remote comms is initialized', async () => {
          const errorSpy = vi.spyOn(logger, 'error');
          await stream.receiveInput(
            makeMessageEvent('m0', {
              method: 'resetAllBackoffs',
              params: [],
            }),
          );
          await delay(10);
          expect(errorSpy).not.toHaveBeenCalled();
        });

        it('resets backoffs on the netlayer after initialization', async () => {
          await stream.receiveInput(
            makeInitializeRemoteCommsMessageEvent('m0', '0xabcd', {}),
          );
          await delay(10);
          await stream.receiveInput(
            makeMessageEvent('m1', {
              method: 'resetAllBackoffs',
              params: [],
            }),
          );
          await delay(10);
          expect(mockResetAllBackoffs).toHaveBeenCalledOnce();
        });
      });
    });
  });
});
