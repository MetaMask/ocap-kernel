import { MuxerClosedError } from '@libp2p/interface';
import { AbortError } from '@metamask/kernel-errors';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Channel } from './types.ts';

// Mock heavy/libp2p related deps with minimal shims we can assert against.

// Track state shared between mocks and tests
const libp2pState: {
  handler?:
    | ((args: {
        connection: { remotePeer: { toString: () => string } };
        stream: object;
      }) => void | Promise<void>)
    | undefined;
  dials: {
    addr: string;
    protocol: string;
    options: { signal: AbortSignal };
    stream: object;
  }[];
  stopCalled: boolean;
  startCalled: boolean;
} = { dials: [], stopCalled: false, startCalled: false };

vi.mock('@chainsafe/libp2p-noise', () => ({ noise: () => ({}) }));
vi.mock('@chainsafe/libp2p-yamux', () => ({ yamux: () => ({}) }));
vi.mock('@libp2p/bootstrap', () => ({ bootstrap: () => ({}) }));
vi.mock('@libp2p/circuit-relay-v2', () => ({
  circuitRelayTransport: () => ({}),
}));
vi.mock('@libp2p/identify', () => ({ identify: () => ({}) }));
vi.mock('@libp2p/webrtc', () => ({ webRTC: () => ({}) }));
vi.mock('@libp2p/websockets', () => ({ webSockets: () => ({}) }));
vi.mock('@libp2p/webtransport', () => ({ webTransport: () => ({}) }));
vi.mock('@libp2p/ping', () => ({ ping: () => ({}) }));

const generateKeyPairFromSeed = vi.fn(async () => ({
  /* private key */
}));
vi.mock('@libp2p/crypto/keys', () => ({
  generateKeyPairFromSeed,
}));

vi.mock('@metamask/kernel-utils', () => ({
  fromHex: (_hex: string) => new Uint8Array(_hex.length / 2),
  retryWithBackoff: async <OperationResult>(
    operation: () => Promise<OperationResult>,
    options?: {
      jitter?: boolean;
      shouldRetry?: (error: unknown) => boolean;
      onRetry?: (info: {
        attempt: number;
        maxAttempts?: number;
        delayMs: number;
      }) => void;
      signal?: AbortSignal;
    },
  ) => {
    // Simple implementation that tries once, then calls onRetry and tries again
    try {
      return await operation();
    } catch (error) {
      if (options?.shouldRetry?.(error)) {
        options?.onRetry?.({ attempt: 1, maxAttempts: 3, delayMs: 100 });
        return await operation();
      }
      throw error;
    }
  },
}));

vi.mock('@metamask/kernel-errors', () => ({
  AbortError: class MockAbortError extends Error {
    constructor() {
      super('Operation aborted');
      this.name = 'AbortError';
    }
  },
  isRetryableNetworkError: (error: unknown) => {
    const networkError = error as Error & { code?: string };
    return (
      networkError.code === 'ECONNRESET' || networkError.code === 'ETIMEDOUT'
    );
  },
}));

const mockLoggerLog = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@metamask/logger', () => ({
  Logger: class {
    log = mockLoggerLog;

    error = mockLoggerError;
  },
}));

vi.mock('@multiformats/multiaddr', () => ({
  multiaddr: (addr: string) => addr,
}));

// Simple ByteStream mock
type MockByteStream = {
  write: (chunk: Uint8Array) => Promise<void>;
  read: () => Promise<Uint8Array | undefined>;
  writes: Uint8Array[];
};

const streamMap = new WeakMap<object, MockByteStream>();
vi.mock('it-byte-stream', () => ({
  byteStream: (stream: object) => {
    const bs: MockByteStream = {
      writes: [],
      async write(chunk: Uint8Array) {
        bs.writes.push(chunk);
      },
      async read() {
        return undefined;
      },
    };
    streamMap.set(stream, bs);
    return bs;
  },
  getByteStreamFor: (stream: object) => streamMap.get(stream),
}));

const createLibp2p = vi.fn();
vi.mock('libp2p', () => ({
  createLibp2p,
}));

describe('ConnectionFactory', () => {
  let factory: Awaited<
    ReturnType<typeof import('./ConnectionFactory.ts').ConnectionFactory.make>
  >;
  const keySeed = '0x1234567890abcdef';
  const knownRelays = [
    '/dns4/relay1.example/tcp/443/wss/p2p/relay1',
    '/dns4/relay2.example/tcp/443/wss/p2p/relay2',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    libp2pState.dials = [];
    libp2pState.handler = undefined;
    libp2pState.stopCalled = false;
    libp2pState.startCalled = false;
    mockLoggerLog.mockClear();
    mockLoggerError.mockClear();

    // Default mock implementation for createLibp2p
    createLibp2p.mockImplementation(async () => ({
      start: vi.fn(() => {
        libp2pState.startCalled = true;
      }),
      stop: vi.fn(() => {
        libp2pState.stopCalled = true;
      }),
      peerId: {
        toString: () => 'test-peer-id',
      },
      addEventListener: vi.fn(),
      dialProtocol: vi.fn(
        async (
          addr: string,
          protocol: string,
          options: { signal: AbortSignal },
        ) => {
          const stream = {};
          libp2pState.dials.push({ addr, protocol, options, stream });
          return stream;
        },
      ),
      handle: vi.fn(
        async (
          _protocol: string,
          handler?: (args: {
            connection: { remotePeer: { toString: () => string } };
            stream: object;
          }) => void | Promise<void>,
        ) => {
          libp2pState.handler = handler;
        },
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Create a new ConnectionFactory.
   *
   * @param signal - The signal to use for the ConnectionFactory.
   * @returns The ConnectionFactory.
   */
  async function createFactory(
    signal?: AbortSignal,
  ): Promise<
    Awaited<
      ReturnType<typeof import('./ConnectionFactory.ts').ConnectionFactory.make>
    >
  > {
    const { ConnectionFactory } = await import('./ConnectionFactory.ts');
    const { Logger } = await import('@metamask/logger');
    return ConnectionFactory.make(
      keySeed,
      knownRelays,
      new Logger(),
      signal ?? new AbortController().signal,
    );
  }

  describe('initialize', () => {
    it('creates and starts libp2p node', async () => {
      factory = await createFactory();

      expect(createLibp2p).toHaveBeenCalledOnce();
      expect(libp2pState.startCalled).toBe(true);
    });

    it('registers inbound handler', async () => {
      factory = await createFactory();

      expect(libp2pState.handler).toBeDefined();
      expect(typeof libp2pState.handler).toBe('function');
    });

    it('configures libp2p with correct transports', async () => {
      factory = await createFactory();

      const callArgs = createLibp2p.mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.transports).toHaveLength(4); // webSockets, webTransport, webRTC, circuitRelay
    });

    it('uses provided key seed for key generation', async () => {
      factory = await createFactory();

      expect(generateKeyPairFromSeed).toHaveBeenCalledWith(
        'Ed25519',
        expect.any(Uint8Array),
      );
    });

    it('configures bootstrap with known relays', async () => {
      factory = await createFactory();

      const callArgs = createLibp2p.mock.calls[0]?.[0];
      expect(callArgs.peerDiscovery).toBeDefined();
    });

    it('configures connectionGater to allow all multiaddrs', async () => {
      factory = await createFactory();

      const callArgs = createLibp2p.mock.calls[0]?.[0];
      expect(callArgs.connectionGater).toBeDefined();
      expect(callArgs.connectionGater.denyDialMultiaddr).toBeDefined();

      // Test that denyDialMultiaddr returns false (allowing connections)
      const result = await callArgs.connectionGater.denyDialMultiaddr();
      expect(result).toBe(false);
    });

    it('registers peer update event listener', async () => {
      const mockAddEventListener = vi.fn();
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer-id' },
        addEventListener: mockAddEventListener,
        dialProtocol: vi.fn(),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      expect(mockAddEventListener).toHaveBeenCalledWith(
        'self:peer:update',
        expect.any(Function),
      );

      // Test that the event listener logs peer updates
      const eventHandler = mockAddEventListener.mock.calls[0]?.[1];
      const mockEvent = { detail: { peerId: 'test-peer', addresses: [] } };
      eventHandler(mockEvent);

      // Verify the logger was called with the peer update
      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining('Peer update:'),
      );
    });
  });

  describe('onInboundConnection', () => {
    it('sets inbound handler', async () => {
      factory = await createFactory();

      const handler = vi.fn();
      factory.onInboundConnection(handler);

      // Simulate inbound connection
      const inboundStream = {};
      await libp2pState.handler?.({
        connection: { remotePeer: { toString: () => 'remote-peer' } },
        stream: inboundStream,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          peerId: 'remote-peer',
          hints: [],
        }),
      );
    });

    it('creates channel with byte stream for inbound connections', async () => {
      factory = await createFactory();

      let capturedChannel: Channel | undefined;
      factory.onInboundConnection((channel: Channel) => {
        capturedChannel = channel;
      });

      const inboundStream = {};
      await libp2pState.handler?.({
        connection: { remotePeer: { toString: () => 'inbound-peer' } },
        stream: inboundStream,
      });

      expect(capturedChannel).toBeDefined();
      expect(capturedChannel?.msgStream).toBeDefined();
      expect(capturedChannel?.peerId).toBe('inbound-peer');
    });
  });

  describe('candidateAddressStrings', () => {
    it('generates WebRTC and circuit addresses for each relay', async () => {
      factory = await createFactory();

      const addresses = factory.candidateAddressStrings('peer123', []);

      expect(addresses).toHaveLength(4); // 2 relays × 2 types
      expect(addresses[0]).toBe(
        `${knownRelays[0]}/p2p-circuit/webrtc/p2p/peer123`,
      );
      expect(addresses[1]).toBe(`${knownRelays[0]}/p2p-circuit/p2p/peer123`);
      expect(addresses[2]).toBe(
        `${knownRelays[1]}/p2p-circuit/webrtc/p2p/peer123`,
      );
      expect(addresses[3]).toBe(`${knownRelays[1]}/p2p-circuit/p2p/peer123`);
    });

    it('prioritizes hints over known relays', async () => {
      factory = await createFactory();

      const hints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];
      const addresses = factory.candidateAddressStrings('peer123', hints);

      // Hints should come first
      expect(addresses[0]).toContain('hint.example');
      expect(addresses[1]).toContain('hint.example');
      // Then known relays
      expect(addresses[2]).toContain('relay1.example');
    });

    it('does not duplicate relays that are also in hints', async () => {
      factory = await createFactory();

      // Use one of the known relays as a hint
      const hints = [knownRelays[0] as string];
      const addresses = factory.candidateAddressStrings('peer123', hints);

      // Should not have duplicates
      const relay1Addresses = addresses.filter((addr: string) =>
        addr.includes('relay1.example'),
      );
      expect(relay1Addresses).toHaveLength(2); // Just WebRTC and circuit
    });
  });

  describe('openChannelOnce', () => {
    it('dials and returns channel on success', async () => {
      factory = await createFactory();

      const channel = await factory.openChannelOnce('peer123');

      expect(channel).toBeDefined();
      expect(channel.peerId).toBe('peer123');
      expect(channel.msgStream).toBeDefined();
      expect(libp2pState.dials).toHaveLength(1);
    });

    it('tries multiple addresses until one succeeds', async () => {
      let attemptCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async (addr: string) => {
          attemptCount += 1;
          if (attemptCount < 3) {
            throw new Error('Connection failed');
          }
          const stream = {};
          libp2pState.dials.push({
            addr,
            protocol: 'whatever',
            options: { signal: AbortSignal.timeout(30_000) },
            stream,
          });
          return stream;
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      const channel = await factory.openChannelOnce('peer123');

      expect(channel).toBeDefined();
      expect(attemptCount).toBe(3);
    });

    it('throws AbortError if signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      factory = await createFactory(controller.signal);

      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        AbortError,
      );
    });

    it('throws AbortError if signal is aborted after dial error', async () => {
      const controller = new AbortController();
      let dialAttempt = 0;

      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          dialAttempt += 1;
          if (dialAttempt === 1) {
            // First attempt: throw error
            throw new Error('Connection failed');
          } else {
            // After first error, abort the signal
            controller.abort();
            throw new Error('Connection failed again');
          }
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory(controller.signal);

      // The error is caught, then on retry signal.aborted is checked and AbortError is thrown
      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        AbortError,
      );
    });

    it('handles MuxerClosedError gracefully', async () => {
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          throw new MuxerClosedError('Muxer closed');
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        MuxerClosedError,
      );
      expect(libp2pState.dials).toHaveLength(0);
    });

    it('handles timeout errors', async () => {
      const abortedSignal = {
        aborted: true,
        reason: new Error('Timeout'),
      };

      vi.spyOn(AbortSignal, 'timeout').mockImplementation(
        () => abortedSignal as unknown as AbortSignal,
      );

      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async (_addr, _protocol, options) => {
          if (options.signal.aborted) {
            throw new Error('Operation timed out');
          }
          throw new Error('Should not reach here');
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        'Operation timed out',
      );
    });

    it('throws last error if all attempts fail', async () => {
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          throw new Error('Final connection error');
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        'Final connection error',
      );
    });
  });

  describe('openChannelWithRetry', () => {
    it('retries on retryable errors', async () => {
      let attemptCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          attemptCount += 1;
          if (attemptCount === 1) {
            const error = new Error('Connection reset') as Error & {
              code: string;
            };
            error.code = 'ECONNRESET';
            throw error;
          }
          const stream = {};
          return stream;
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      const channel = await factory.openChannelWithRetry('peer123');

      expect(channel).toBeDefined();
      expect(attemptCount).toBe(2);
    });

    it('does not retry on non-retryable errors', async () => {
      let attemptCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          attemptCount += 1;
          throw new Error('Non-retryable error');
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await expect(factory.openChannelWithRetry('peer123')).rejects.toThrow(
        'Non-retryable error',
      );
      // Since it tries all 4 addresses (2 relays × 2 types) before giving up
      expect(attemptCount).toBe(4);
    });

    it('calls onRetry callback', async () => {
      let onRetryCallbackCalled = false;
      let attemptCount = 0;

      // Override the mock retryWithBackoff to track onRetry calls
      vi.doMock('@metamask/kernel-utils', () => ({
        fromHex: (_hex: string) => new Uint8Array(_hex.length / 2),
        retryWithBackoff: async <OperationResult>(
          operation: () => Promise<OperationResult>,
          options?: {
            jitter?: boolean;
            shouldRetry?: (error: unknown) => boolean;
            onRetry?: (info: {
              attempt: number;
              maxAttempts?: number;
              delayMs: number;
            }) => void;
            signal?: AbortSignal;
          },
        ) => {
          try {
            return await operation();
          } catch (error) {
            if (options?.shouldRetry?.(error)) {
              onRetryCallbackCalled = true;
              options?.onRetry?.({ attempt: 1, maxAttempts: 3, delayMs: 100 });
              return await operation();
            }
            throw error;
          }
        },
      }));

      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          attemptCount += 1;
          if (attemptCount <= 4) {
            // Fail first 4 attempts (all addresses)
            const error = new Error('Timeout') as Error & { code: string };
            error.code = 'ETIMEDOUT';
            throw error;
          }
          return {};
        }),
        handle: vi.fn(),
      }));

      // Re-import ConnectionFactory to use the new mock
      vi.resetModules();
      const { ConnectionFactory } = await import('./ConnectionFactory.ts');
      const { Logger } = await import('@metamask/logger');
      factory = await ConnectionFactory.make(
        keySeed,
        knownRelays,
        new Logger(),
        new AbortController().signal,
      );

      await factory.openChannelWithRetry('peer123');

      expect(onRetryCallbackCalled).toBe(true);
    });
  });

  describe('dialIdempotent', () => {
    it('only dials once for concurrent requests to same peer', async () => {
      let dialCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          dialCount += 1;
          // Add delay to simulate network latency
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {};
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      // Start two concurrent dials
      const [channel1, channel2] = await Promise.all([
        factory.dialIdempotent('peer123', [], false),
        factory.dialIdempotent('peer123', [], false),
      ]);

      expect(channel1).toBe(channel2);
      expect(dialCount).toBe(1);
    });

    it('allows new dial after previous completes', async () => {
      let dialCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          dialCount += 1;
          return {};
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      // First dial
      await factory.dialIdempotent('peer123', [], false);
      expect(dialCount).toBe(1);

      // Second dial (after first completes)
      await factory.dialIdempotent('peer123', [], false);
      expect(dialCount).toBe(2);
    });

    it('handles different peers independently', async () => {
      let dialCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          dialCount += 1;
          return {};
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await Promise.all([
        factory.dialIdempotent('peer1', [], false),
        factory.dialIdempotent('peer2', [], false),
        factory.dialIdempotent('peer3', [], false),
      ]);

      expect(dialCount).toBe(3);
    });

    it('uses retry when withRetry is true', async () => {
      let attemptCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          attemptCount += 1;
          if (attemptCount === 1) {
            const error = new Error('Retry me') as Error & { code: string };
            error.code = 'ECONNRESET';
            throw error;
          }
          return {};
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await factory.dialIdempotent('peer123', [], true);
      expect(attemptCount).toBe(2);
    });

    it('cleans up inflight dial on error', async () => {
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          throw new Error('Dial failed');
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await expect(
        factory.dialIdempotent('peer123', [], false),
      ).rejects.toThrow('Dial failed');

      // Should be able to retry after failure
      await expect(
        factory.dialIdempotent('peer123', [], false),
      ).rejects.toThrow('Dial failed');
    });
  });

  describe('outputError', () => {
    it('logs error message when problem is provided', async () => {
      // Use a custom dial that will trigger outputError with a problem
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          throw new Error('test error');
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();
      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        'test error',
      );
      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining('peer123:: error issue opening channel:'),
      );
    });

    it('logs error message without problem when problem is falsy', async () => {
      let dialCount = 0;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          dialCount += 1;
          // Throw a falsy value to trigger the else branch in outputError
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw null;
        }),
        handle: vi.fn(),
      }));

      factory = await createFactory();
      await expect(factory.openChannelOnce('peer123')).rejects.toThrow(
        'unable to open channel to peer123',
      );
      expect(dialCount).toBe(4);
      expect(mockLoggerLog).toHaveBeenCalledWith(
        'peer123:: error issue opening channel',
      );
    });
  });

  describe('stop', () => {
    it('calls libp2p.stop() and clears inflight dials', async () => {
      const mockStop = vi.fn().mockImplementation(async () => {
        libp2pState.stopCalled = true;
      });
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: mockStop,
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await factory.stop();

      expect(mockStop).toHaveBeenCalledOnce();
      expect(libp2pState.stopCalled).toBe(true);
    });

    it('clears inflight dials', async () => {
      let resolveDial: (() => void) | undefined;
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(
          async () =>
            new Promise((resolve) => {
              resolveDial = () => resolve({});
            }),
        ),
        handle: vi.fn(),
        getConnections: vi.fn(() => []),
      }));

      factory = await createFactory();

      // Start a dial but don't wait for it
      const dialPromise = factory.dialIdempotent('peer123', [], false);

      // Stop should clear inflight dials
      await factory.stop();

      // Complete the dial
      resolveDial?.();

      // The dial should still resolve (but inflight map is cleared)
      expect(await dialPromise).toBeDefined();
    });

    it('handles libp2p.stop() errors gracefully', async () => {
      const mockStop = vi
        .fn()
        .mockRejectedValue(new Error('libp2p.stop() failed'));
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: mockStop,
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(),
        handle: vi.fn(),
      }));

      factory = await createFactory();

      await factory.stop();

      // Verify libp2p.stop() was called
      expect(mockStop).toHaveBeenCalledOnce();
      // Verify error was logged
      expect(mockLoggerError).toHaveBeenCalledWith(
        'libp2p.stop() failed or timed out:',
        expect.any(Error),
      );
      // Should not throw - continues anyway
    });

    it('handles empty connections list', async () => {
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(),
        handle: vi.fn(),
        getConnections: vi.fn(() => []),
      }));

      factory = await createFactory();

      // Should not throw with no connections
      expect(await factory.stop()).toBeUndefined();
    });

    it('stop is asynchronous', async () => {
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(),
        stop: vi.fn(),
        peerId: { toString: () => 'test-peer' },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(),
        handle: vi.fn(),
        getConnections: vi.fn(() => []),
      }));

      factory = await createFactory();

      // stop() returns a Promise
      const result = factory.stop();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('integration scenarios', () => {
    it('handles complete connection lifecycle', async () => {
      createLibp2p.mockImplementation(async () => ({
        start: vi.fn(() => {
          libp2pState.startCalled = true;
        }),
        stop: vi.fn(async () => {
          libp2pState.stopCalled = true;
        }),
        peerId: {
          toString: () => 'test-peer-id',
        },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(
          async (
            addr: string,
            protocol: string,
            options: { signal: AbortSignal },
          ) => {
            const stream = {};
            libp2pState.dials.push({ addr, protocol, options, stream });
            return stream;
          },
        ),
        handle: vi.fn(
          async (
            _protocol: string,
            handler?: (args: {
              connection: { remotePeer: { toString: () => string } };
              stream: object;
            }) => void | Promise<void>,
          ) => {
            libp2pState.handler = handler;
          },
        ),
        getConnections: vi.fn(() => []),
      }));

      factory = await createFactory();

      // Open channel
      const channel = await factory.openChannelOnce('peer123', [
        '/dns4/hint.example/tcp/443/wss/p2p/hint',
      ]);
      expect(channel.peerId).toBe('peer123');

      // Verify dial was made
      expect(libp2pState.dials).toHaveLength(1);
      expect(libp2pState.dials[0]?.addr).toContain('hint.example');

      // Clean up
      await factory.stop();
      expect(libp2pState.stopCalled).toBe(true);
    });

    it('handles inbound and outbound connections', async () => {
      factory = await createFactory();

      const receivedChannels: Channel[] = [];
      factory.onInboundConnection((channel: Channel) => {
        receivedChannels.push(channel);
      });

      // Simulate inbound connection
      const inboundStream = {};
      await libp2pState.handler?.({
        connection: { remotePeer: { toString: () => 'inbound-peer' } },
        stream: inboundStream,
      });

      // Make outbound connection
      const outboundChannel = await factory.openChannelOnce('outbound-peer');

      expect(receivedChannels).toHaveLength(1);
      expect(receivedChannels[0]?.peerId).toBe('inbound-peer');
      expect(outboundChannel.peerId).toBe('outbound-peer');
    });
  });
});
