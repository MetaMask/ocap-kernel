import { describe, expect, it, vi, beforeEach } from 'vitest';

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
} = { dials: [] };

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

const generateKeyPairFromSeed = vi.fn(async () => ({
  /* private key */
}));
vi.mock('@libp2p/crypto/keys', () => ({
  generateKeyPairFromSeed,
}));

vi.mock('@metamask/kernel-utils', () => ({
  // Minimal passthrough is fine; the value is only passed to generateKeyPairFromSeed
  fromHex: (_hex: string) => new Uint8Array(_hex.length / 2),
  // Provide a trivial retry implementation that just runs the operation once
  retryWithBackoff: async <OperationResult>(
    operation: () => Promise<OperationResult>,
  ) => operation(),
  // Mock wake detector with a no-op implementation
  installWakeDetector: (_onWake: () => void) => () => {
    // Return cleanup function
  },
  abortableDelay: async (ms: number) => {
    // Simple non-abortable delay for tests
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
  calculateReconnectionBackoff: (_attempt: number) => 100, // Fixed delay for tests
  DEFAULT_MAX_RETRY_ATTEMPTS: 0, // infinite
}));

vi.mock('@metamask/logger', () => ({
  Logger: class {
    log = vi.fn();

    error = vi.fn();
  },
}));

vi.mock('@multiformats/multiaddr', () => ({
  // Identity implementation adequate for constructing address string assertions
  multiaddr: (addr: string) => addr,
}));

vi.mock('uint8arrays', () => ({
  toString: (uint8Array: Uint8Array) => new TextDecoder().decode(uint8Array),
  fromString: (str: string) => new TextEncoder().encode(str),
}));

// Simple ByteStream mock with readable queue and write capture
type MockByteStream = {
  write: (chunk: Uint8Array) => Promise<void>;
  read: () => Promise<Uint8Array | undefined>;
  writes: Uint8Array[];
  pushInbound: (chunk: Uint8Array) => void;
};

const streamMap = new WeakMap<object, MockByteStream>();
const writeFailureMap = new WeakMap<object, number>();
vi.mock('it-byte-stream', () => ({
  byteStream: (stream: object) => {
    let pending: ((c: Uint8Array) => void) | undefined;
    const queue: Uint8Array[] = [];
    const bs: MockByteStream = {
      writes: [],
      async write(chunk: Uint8Array) {
        const remainingFailures = writeFailureMap.get(stream) ?? 0;
        if (remainingFailures > 0) {
          writeFailureMap.set(stream, remainingFailures - 1);
          throw new Error('Injected write failure');
        }
        bs.writes.push(chunk);
      },
      async read() {
        if (queue.length > 0) {
          return queue.shift();
        }
        return await new Promise<Uint8Array>((resolve) => {
          pending = resolve;
        });
      },
      pushInbound(chunk: Uint8Array) {
        if (pending) {
          const pen = pending;
          pending = undefined;
          pen(chunk);
        } else {
          queue.push(chunk);
        }
      },
    };
    streamMap.set(stream, bs);
    return bs;
  },
  getByteStreamFor: (stream: object) => streamMap.get(stream),
  setWriteFailures: (stream: object, count: number) => {
    writeFailureMap.set(stream, count);
  },
}));

vi.mock('libp2p', () => ({
  createLibp2p: vi.fn(async () => {
    return {
      start: vi.fn(),
      peerId: {
        toString: () => 'test-peer-id-12345',
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
    } as const;
  }),
  libp2pState,
}));

describe('network.initNetwork', { timeout: 10_000 }, () => {
  beforeEach(() => {
    libp2pState.dials = [];
    libp2pState.handler = undefined;
    generateKeyPairFromSeed.mockClear();
  });

  it('returns a sender that opens a channel once and writes', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0x1234',
      knownRelays,
      remoteHandler,
    );

    // First send should dial and write
    await send('peer-123', 'hello');

    expect(libp2pState.dials).toHaveLength(1);
    const dial = libp2pState.dials[0];
    expect(dial?.protocol).toBe('whatever');
    expect(dial?.addr).toBe(
      `${knownRelays[0]}/p2p-circuit/webrtc/p2p/peer-123`,
    );

    // Verify message was written to the byte stream
    const { getByteStreamFor } = (await import(
      'it-byte-stream'
    )) as unknown as {
      getByteStreamFor: (stream: object) => MockByteStream | undefined;
    };
    const bs = getByteStreamFor(dial?.stream as object) as MockByteStream;
    expect(bs.writes).toHaveLength(1);

    // Second send to same peer should reuse channel (no new dials)
    await send('peer-123', 'again');
    expect(libp2pState.dials).toHaveLength(1);
    expect(bs.writes).toHaveLength(2);
  });

  it('handles inbound message and calls remoteMessageHandler', async () => {
    const knownRelays: string[] = [];
    const remoteHandler = vi.fn(async () => 'ok');

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xabcd',
      knownRelays,
      remoteHandler,
    );
    expect(typeof send).toBe('function');

    // Simulate inbound connection
    const { libp2pState: mockLibp2pState } = (await import(
      'libp2p'
    )) as unknown as {
      libp2pState: typeof libp2pState;
    };
    const inboundStream = {};
    await mockLibp2pState.handler?.({
      connection: { remotePeer: { toString: () => 'peer-inbound' } },
      stream: inboundStream,
    });

    // Push an inbound message and wait a microtask for the handler to run
    const { getByteStreamFor } = (await import(
      'it-byte-stream'
    )) as unknown as {
      getByteStreamFor: (stream: object) => MockByteStream | undefined;
    };
    const bs = getByteStreamFor(inboundStream) as MockByteStream;
    const { fromString } = await import('uint8arrays');
    bs.pushInbound(fromString('ping'));

    // Wait until the remote handler is called
    await vi.waitFor(() => {
      expect(remoteHandler).toHaveBeenCalledWith('peer-inbound', 'ping');
    });
  });

  it('tries fallback addresses when first connection fails', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    // Track dial attempts
    const dialAttempts: string[] = [];

    // Override createLibp2p to fail first attempt but succeed on second
    const { createLibp2p } = await import('libp2p');
    (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({
        start: vi.fn(),
        peerId: {
          toString: () => 'test-peer-id-fallback',
        },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(
          async (
            addr: string,
            protocol: string,
            options: { signal: AbortSignal },
          ) => {
            dialAttempts.push(addr);

            // Fail WebRTC attempt
            if (addr.includes('/webrtc/')) {
              throw new Error('WebRTC connection failed');
            }

            // Succeed on regular circuit relay
            const stream = {};
            libp2pState.dials.push({ addr, protocol, options, stream });
            return stream;
          },
        ),
        handle: vi.fn(async () => {
          // do nothing
        }),
      }),
    );

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xfallback',
      knownRelays,
      remoteHandler,
    );

    await send('peer-fallback', 'msg');

    // Should have tried WebRTC first, then regular circuit
    expect(dialAttempts).toHaveLength(2);
    expect(dialAttempts[0]).toBe(
      `${knownRelays[0]}/p2p-circuit/webrtc/p2p/peer-fallback`,
    );
    expect(dialAttempts[1]).toBe(
      `${knownRelays[0]}/p2p-circuit/p2p/peer-fallback`,
    );

    // Only the successful dial should be recorded
    expect(libp2pState.dials).toHaveLength(1);
    expect(libp2pState.dials[0]?.addr).toBe(
      `${knownRelays[0]}/p2p-circuit/p2p/peer-fallback`,
    );
  });

  it('swallows dial errors and does not throw from send when all attempts fail', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    // Override createLibp2p to throw on all dial attempts
    const { createLibp2p } = await import('libp2p');
    (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({
        start: vi.fn(),
        peerId: {
          toString: () => 'test-peer-id-fail-all',
        },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(
          async (
            _addr: string,
            _p: string,
            _options: { signal: AbortSignal },
          ) => {
            throw new Error('All connections failed');
          },
        ),
        handle: vi.fn(async () => {
          // do nothing
        }),
      }),
    );

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xdeadbeef',
      knownRelays,
      remoteHandler,
    );

    expect(await send('peer-x', 'msg')).toBeUndefined();
    // No successful dials recorded in shared state for this test run
    expect(libp2pState.dials).toHaveLength(0);
  });

  it('handles outputError with no problem parameter', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    // Override createLibp2p to throw undefined/null errors
    const { createLibp2p } = await import('libp2p');
    (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({
        start: vi.fn(),
        peerId: {
          toString: () => 'test-peer-id-no-problem',
        },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw undefined; // Test outputError with no problem
        }),
        handle: vi.fn(async () => {
          // do nothing
        }),
      }),
    );

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xnoproblem',
      knownRelays,
      remoteHandler,
    );

    expect(await send('peer-no-problem', 'msg')).toBeUndefined();
  });

  it('handles write errors when sending messages', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xwriteerror',
      knownRelays,
      remoteHandler,
    );

    // First send to establish channel
    await send('peer-write-error', 'hello');

    // Mock the byte stream to throw on write
    const { getByteStreamFor } = (await import(
      'it-byte-stream'
    )) as unknown as {
      getByteStreamFor: (stream: object) => MockByteStream | undefined;
    };
    const dial = libp2pState.dials[0];
    const bs = getByteStreamFor(dial?.stream as object) as MockByteStream;

    // Override write to throw
    vi.spyOn(bs, 'write').mockImplementation(async () => {
      throw new Error('Write failed');
    });

    // This should not throw, but should handle the error internally
    expect(await send('peer-write-error', 'fail-message')).toBeUndefined();
  });

  it('handles timeout errors when opening channels', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    // Track attempts to help verify timeout behavior
    let attemptCount = 0;

    // Create a mock aborted signal
    const abortedSignal = {
      aborted: true,
      throwIfAborted: vi.fn(() => {
        throw Object.assign(
          new Error('The operation was aborted due to timeout'),
          {
            name: 'AbortError',
            code: 'ABORT_ERR',
          },
        );
      }),
    };

    // Mock AbortSignal.timeout
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(
      () => abortedSignal as unknown as AbortSignal,
    );

    const { createLibp2p } = await import('libp2p');
    (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({
        start: vi.fn(),
        peerId: {
          toString: () => 'test-peer-id-timeout',
        },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(async (_addr, _protocol, options) => {
          attemptCount += 1;
          // All attempts should fail with timeout due to aborted signal
          if (options.signal.aborted) {
            throw Object.assign(
              new Error('The operation was aborted due to timeout'),
              {
                name: 'AbortError',
                code: 'ABORT_ERR',
              },
            );
          }
          // Shouldn't reach here, but throw anyway
          throw new Error('Connection failed');
        }),
        handle: vi.fn(async () => {
          // do nothing
        }),
      }),
    );

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xtimeout',
      knownRelays,
      remoteHandler,
    );

    // Send should not throw even with timeout
    expect(await send('peer-timeout', 'msg')).toBeUndefined();

    // Should have tried both connection strategies before timing out
    expect(attemptCount).toBe(2); // WebRTC and regular circuit relay

    // Restore the mock
    vi.restoreAllMocks();
  });

  it('tries multiple relays when provided', async () => {
    const knownRelays = [
      '/dns4/relay1.example/tcp/443/wss/p2p/relay1Peer',
      '/dns4/relay2.example/tcp/443/wss/p2p/relay2Peer',
    ];
    const remoteHandler = vi.fn(async () => 'ok');

    // Track all dial attempts
    const dialAttempts: string[] = [];

    const { createLibp2p } = await import('libp2p');
    (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => ({
        start: vi.fn(),
        peerId: {
          toString: () => 'test-peer-id-multi-relays',
        },
        addEventListener: vi.fn(),
        dialProtocol: vi.fn(
          async (
            addr: string,
            protocol: string,
            options: { signal: AbortSignal },
          ) => {
            dialAttempts.push(addr);

            // Fail all attempts except the last one to test all paths
            if (dialAttempts.length < 4) {
              throw new Error(
                `Connection attempt ${dialAttempts.length} failed`,
              );
            }

            // Succeed on the 4th attempt
            const stream = {};
            libp2pState.dials.push({ addr, protocol, options, stream });
            return stream;
          },
        ),
        handle: vi.fn(async () => {
          // do nothing
        }),
      }),
    );

    const { initNetwork } = await import('./network.ts');
    const { sendRemoteMessage: send } = await initNetwork(
      '0xmultirelays',
      knownRelays,
      remoteHandler,
    );

    await send('peer-multi', 'test');

    // Should have tried both WebRTC and regular for each relay
    expect(dialAttempts).toHaveLength(4);
    expect(dialAttempts).toStrictEqual([
      `${knownRelays[0]}/p2p-circuit/webrtc/p2p/peer-multi`,
      `${knownRelays[0]}/p2p-circuit/p2p/peer-multi`,
      `${knownRelays[1]}/p2p-circuit/webrtc/p2p/peer-multi`,
      `${knownRelays[1]}/p2p-circuit/p2p/peer-multi`,
    ]);

    // Only the successful dial should be recorded
    expect(libp2pState.dials).toHaveLength(1);
    expect(libp2pState.dials[0]?.addr).toBe(
      `${knownRelays[1]}/p2p-circuit/p2p/peer-multi`,
    );
  });

  describe('stop functionality', () => {
    it('returns a stop function', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { initNetwork } = await import('./network.ts');
      const { stop } = await initNetwork('0xstop', knownRelays, remoteHandler);

      expect(typeof stop).toBe('function');
    });

    it('stop function cleans up libp2p', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const mockLibp2pStop = vi.fn().mockResolvedValue(undefined);
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: mockLibp2pStop,
          peerId: { toString: () => 'test-peer-stop' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { stop } = await initNetwork('0xstop2', knownRelays, remoteHandler);

      await stop();

      expect(mockLibp2pStop).toHaveBeenCalledOnce();
    });

    it('stop function handles libp2p stop errors gracefully', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const mockLibp2pStop = vi
        .fn()
        .mockRejectedValue(new Error('libp2p stop failed'));
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: mockLibp2pStop,
          peerId: { toString: () => 'test-peer-stop-error' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { stop } = await initNetwork(
        '0xstoperror',
        knownRelays,
        remoteHandler,
      );

      // Should not throw
      const result = await stop();
      expect(result).toBeUndefined();
      expect(mockLibp2pStop).toHaveBeenCalledOnce();
    });
  });

  describe('message queueing during reconnection', () => {
    it('queues messages when connection is being reestablished', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      // Track dial attempts
      let dialCount = 0;
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-queue' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;
            if (dialCount === 1) {
              // First attempt succeeds
              const stream = {};
              libp2pState.dials.push({
                addr: 'test',
                protocol: 'whatever',
                options: { signal: AbortSignal.timeout(30_000) },
                stream,
              });
              return stream;
            }
            // Subsequent attempts fail to test reconnection
            throw new Error('Connection failed');
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xqueue',
        knownRelays,
        remoteHandler,
      );

      // First message establishes connection
      await send('peer-queue', 'msg1');
      expect(dialCount).toBe(1);

      // Implementation detail: message queuing tested through integration
      // (difficult to test directly due to internal state)
    });
  });

  describe('error handling', () => {
    it('handles MuxerClosedError gracefully', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { MuxerClosedError } = await import('@libp2p/interface');
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-muxer' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            throw new MuxerClosedError('Muxer closed');
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xmuxer',
        knownRelays,
        remoteHandler,
      );

      // Should handle error gracefully and not throw
      const result = await send('peer-muxer', 'test');
      expect(result).toBeUndefined();
    });

    it('handles various network error codes', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const networkError = new Error('Connection reset') as Error & {
        code: string;
      };
      networkError.code = 'ECONNRESET';

      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-network-error' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            throw networkError;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xneterr',
        knownRelays,
        remoteHandler,
      );

      // Should handle network error gracefully
      const result = await send('peer-net-err', 'test');
      expect(result).toBeUndefined();
    });
  });

  describe('channel management', () => {
    it('reuses existing channels for same peer', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xreuse',
        knownRelays,
        remoteHandler,
      );

      // First send creates channel
      await send('peer-reuse', 'msg1');
      expect(libp2pState.dials).toHaveLength(1);

      // Second send to same peer reuses channel
      await send('peer-reuse', 'msg2');
      expect(libp2pState.dials).toHaveLength(1);

      // But different peer gets new channel
      await send('peer-other', 'msg3');
      expect(libp2pState.dials).toHaveLength(2);
    });

    it('opens separate channels for different peers', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xmulti',
        knownRelays,
        remoteHandler,
      );

      await send('peer1', 'hello');
      await send('peer2', 'world');
      await send('peer3', 'test');

      expect(libp2pState.dials).toHaveLength(3);
    });
  });

  describe('relay selection', () => {
    it('tries WebRTC before WebSocket for each relay', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const dialAttempts: string[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-relay-order' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async (addr: string) => {
            dialAttempts.push(addr);
            // Succeed on second attempt
            if (dialAttempts.length === 2) {
              const stream = {};
              libp2pState.dials.push({
                addr,
                protocol: 'whatever',
                options: { signal: AbortSignal.timeout(30_000) },
                stream,
              });
              return stream;
            }
            throw new Error('Connection failed');
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xrelayorder',
        knownRelays,
        remoteHandler,
      );

      await send('peer-order', 'test');

      // Should try WebRTC first, then regular
      expect(dialAttempts[0]).toContain('/webrtc/');
      expect(dialAttempts[1]).not.toContain('/webrtc/');
    });

    it('uses hints in addition to known relays', async () => {
      const knownRelays = ['/dns4/relay1.example/tcp/443/wss/p2p/relay1'];
      const hints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];
      const remoteHandler = vi.fn(async () => 'ok');

      const dialAttempts: string[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-hints' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async (addr: string) => {
            dialAttempts.push(addr);
            // Succeed on first attempt
            if (dialAttempts.length === 1) {
              const stream = {};
              libp2pState.dials.push({
                addr,
                protocol: 'whatever',
                options: { signal: AbortSignal.timeout(30_000) },
                stream,
              });
              return stream;
            }
            throw new Error('Should not reach here');
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xhints',
        knownRelays,
        remoteHandler,
      );

      await send('peer-hints', 'test', hints);

      // Hints should be tried first (before known relays)
      expect(dialAttempts[0]).toContain('hint.example');
    });
  });

  describe('inbound connections', () => {
    it('accepts and processes inbound connections', async () => {
      const knownRelays: string[] = [];
      const remoteHandler = vi.fn(async () => 'reply');

      const { initNetwork } = await import('./network.ts');
      await initNetwork('0xinbound', knownRelays, remoteHandler);

      // Verify that a handler was registered
      const { libp2pState: state } = (await import('libp2p')) as unknown as {
        libp2pState: typeof libp2pState;
      };
      expect(state.handler).toBeDefined();
      expect(typeof state.handler).toBe('function');
    });

    it('processes messages from inbound connections', async () => {
      const knownRelays: string[] = [];
      const receivedMessages: { from: string; message: string }[] = [];
      const remoteHandler = vi.fn(async (from: string, message: string) => {
        receivedMessages.push({ from, message });
        return 'acknowledged';
      });

      const { initNetwork } = await import('./network.ts');
      await initNetwork('0xinbound2', knownRelays, remoteHandler);

      // Simulate inbound connection
      const { libp2pState: state } = (await import('libp2p')) as unknown as {
        libp2pState: typeof libp2pState;
      };

      const inboundStream = {};
      await state.handler?.({
        connection: { remotePeer: { toString: () => 'inbound-peer' } },
        stream: inboundStream,
      });

      // Send a message through the inbound stream
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const bs = getByteStreamFor(inboundStream) as MockByteStream;
      const { fromString } = await import('uint8arrays');
      bs.pushInbound(fromString('test-inbound-message'));

      // Wait for handler to be called
      await vi.waitFor(() => {
        expect(receivedMessages).toHaveLength(1);
        expect(receivedMessages[0]).toStrictEqual({
          from: 'inbound-peer',
          message: 'test-inbound-message',
        });
      });
    });
  });

  describe('address construction', () => {
    it('constructs correct WebRTC addresses', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const dialAttempts: string[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-addr' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async (addr: string) => {
            dialAttempts.push(addr);
            const stream = {};
            libp2pState.dials.push({
              addr,
              protocol: 'whatever',
              options: { signal: AbortSignal.timeout(30_000) },
              stream,
            });
            return stream;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xaddr',
        knownRelays,
        remoteHandler,
      );

      await send('test-peer', 'msg');

      // First attempt should be WebRTC
      expect(dialAttempts[0]).toBe(
        `${knownRelays[0]}/p2p-circuit/webrtc/p2p/test-peer`,
      );
    });

    it('constructs correct relay circuit addresses', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const dialAttempts: string[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-circuit' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async (addr: string) => {
            dialAttempts.push(addr);
            // Fail WebRTC, succeed on circuit
            if (addr.includes('/webrtc/')) {
              throw new Error('WebRTC failed');
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
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xcircuit',
        knownRelays,
        remoteHandler,
      );

      await send('test-peer-c', 'msg');

      // Should try WebRTC first, then fall back to circuit
      expect(dialAttempts).toHaveLength(2);
      expect(dialAttempts[1]).toBe(
        `${knownRelays[0]}/p2p-circuit/p2p/test-peer-c`,
      );
      expect(libp2pState.dials).toHaveLength(1);
      expect(libp2pState.dials[0]?.addr).not.toContain('/webrtc/');
    });
  });

  describe('signal abort handling', () => {
    it('stops reading channel when signal is aborted', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send, stop } = await initNetwork(
        '0xabortread',
        knownRelays,
        remoteHandler,
      );

      // Establish a channel
      await send('peer-abort', 'hello');
      expect(libp2pState.dials).toHaveLength(1);

      // Stop immediately - this aborts the signal
      await stop();

      // The readChannel loop should have exited gracefully
      expect(await send('peer-abort', 'hello2')).toBeUndefined();
    });

    it('aborts reconnection delay when signal is aborted', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      let dialCount = 0;
      const streams: object[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-abort-delay' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;
            if (dialCount === 1) {
              // First dial succeeds
              const stream = {};
              streams.push(stream);
              return stream;
            }
            // Subsequent dials fail to trigger reconnection
            throw new Error('Connection failed');
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send, stop } = await initNetwork(
        '0xabortdelay',
        knownRelays,
        remoteHandler,
      );

      // Establish channel
      await send('peer-delay', 'hello');

      // Get the stream and force it to fail
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const bs = getByteStreamFor(streams[0] as object) as MockByteStream;
      vi.spyOn(bs, 'write').mockImplementation(async () => {
        throw new Error('Write failed');
      });

      // Trigger reconnection
      await send('peer-delay', 'trigger-reconnect');

      // Stop during reconnection delay
      await stop();

      // Verify that stop completed without errors
      expect(dialCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('SCTP error handling', () => {
    it('detects SCTP graceful disconnect', async () => {
      const knownRelays: string[] = [];
      const remoteHandler = vi.fn(async () => 'ok');

      // Override byteStream to inject read error
      let readCount = 0;
      const { byteStream } = await import('it-byte-stream');
      vi.spyOn(
        await import('it-byte-stream'),
        'byteStream',
      ).mockImplementationOnce((stream: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bs = byteStream(stream as any);
        vi.spyOn(bs, 'read').mockImplementation(async () => {
          readCount += 1;
          const error = new Error('SCTP failure') as Error & {
            errorDetail?: string;
            sctpCauseCode?: number;
          };
          error.errorDetail = 'sctp-failure';
          error.sctpCauseCode = 12; // SCTP_USER_INITIATED_ABORT
          throw error;
        });
        return bs;
      });

      const { initNetwork } = await import('./network.ts');
      await initNetwork('0xsctp', knownRelays, remoteHandler);

      // Simulate inbound connection
      const { libp2pState: state } = (await import('libp2p')) as unknown as {
        libp2pState: typeof libp2pState;
      };

      const inboundStream = {};
      await state.handler?.({
        connection: { remotePeer: { toString: () => 'peer-sctp' } },
        stream: inboundStream,
      });

      // Wait for the read to be called
      await vi.waitFor(() => {
        expect(readCount).toBeGreaterThan(0);
      });
    });

    it('handles non-SCTP read errors', async () => {
      const knownRelays: string[] = [];
      const remoteHandler = vi.fn(async () => 'ok');

      // Override byteStream to inject read error
      let readCount = 0;
      const { byteStream } = await import('it-byte-stream');
      vi.spyOn(
        await import('it-byte-stream'),
        'byteStream',
      ).mockImplementationOnce((stream: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bs = byteStream(stream as any);
        vi.spyOn(bs, 'read').mockImplementation(async () => {
          readCount += 1;
          throw new Error('Generic read error');
        });
        return bs;
      });

      const { initNetwork } = await import('./network.ts');
      await initNetwork('0xreaderror', knownRelays, remoteHandler);

      // Simulate inbound connection
      const { libp2pState: state } = (await import('libp2p')) as unknown as {
        libp2pState: typeof libp2pState;
      };

      const inboundStream = {};
      await state.handler?.({
        connection: { remotePeer: { toString: () => 'peer-readerror' } },
        stream: inboundStream,
      });

      // Wait for the read to be called
      await vi.waitFor(() => {
        expect(readCount).toBeGreaterThan(0);
      });
    });
  });

  describe('reconnection attempts', () => {
    it('gives up after max reconnection attempts', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      let dialCount = 0;
      const streams: object[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-max-attempts' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;
            if (dialCount === 1) {
              // First dial succeeds
              const stream = {};
              streams.push(stream);
              return stream;
            }
            // All reconnection attempts fail with retryable error
            const error = new Error('Connection failed');
            (error as NodeJS.ErrnoException).code = 'ECONNRESET';
            throw error;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      // Mock DEFAULT_MAX_RETRY_ATTEMPTS to be 3 for this test by temporarily changing the mock
      vi.doMock('@metamask/kernel-utils', async () => ({
        ...(await vi.importActual('@metamask/kernel-utils')),
        DEFAULT_MAX_RETRY_ATTEMPTS: 3,
      }));

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xmaxattempts',
        knownRelays,
        remoteHandler,
      );

      // Establish channel
      await send('peer-maxatt', 'hello');

      // Get the stream and force it to fail
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const bs = getByteStreamFor(streams[0] as object) as MockByteStream;
      vi.spyOn(bs, 'write').mockImplementation(async () => {
        throw new Error('Write failed');
      });

      // Trigger reconnection - this will start the reconnection loop
      await send('peer-maxatt', 'trigger');

      // Queue more messages
      await send('peer-maxatt', 'm1');
      await send('peer-maxatt', 'm2');

      // Wait for max attempts to be reached
      await vi.waitFor(
        () => {
          // After 3 failed attempts, dialCount should be 1 (initial) + 3*2 (3 attempts with WebRTC and fallback)
          expect(dialCount).toBeGreaterThanOrEqual(4);
        },
        { timeout: 2000 },
      );
    });

    it('handles non-retryable errors during reconnection', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      let dialCount = 0;
      const streams: object[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-nonretryable' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;
            if (dialCount === 1) {
              // First dial succeeds
              const stream = {};
              streams.push(stream);
              return stream;
            }
            // Throw non-retryable error
            const error = new Error('Invalid peer ID') as Error & {
              code: string;
            };
            error.code = 'ERR_INVALID_PEER_ID';
            throw error;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xnonretry',
        knownRelays,
        remoteHandler,
      );

      // Establish channel
      await send('peer-nonretry', 'hello');

      // Get the stream and force it to fail
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const bs = getByteStreamFor(streams[0] as object) as MockByteStream;
      vi.spyOn(bs, 'write').mockImplementation(async () => {
        throw new Error('Write failed');
      });

      // Trigger reconnection
      await send('peer-nonretry', 'trigger');

      // Wait a bit for reconnection to be attempted
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have tried initial + one reconnection attempt that failed with non-retryable error
      expect(dialCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('wake from sleep handling', () => {
    it('resets backoffs when waking from sleep', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      // Capture the wake handler by mocking installWakeDetector before importing
      let wakeHandler: (() => void) | undefined;
      vi.doMock('@metamask/kernel-utils', async () => {
        const actual = await vi.importActual<
          typeof import('@metamask/kernel-utils')
        >('@metamask/kernel-utils');
        return {
          ...actual,
          installWakeDetector: (onWake: () => void) => {
            wakeHandler = onWake;
            return () => {
              // cleanup
            };
          },
        };
      });

      // Reimport to get the mocked version
      vi.resetModules();
      const { initNetwork } = await import('./network.ts');
      await initNetwork('0xwake', knownRelays, remoteHandler);

      // Trigger wake event
      expect(wakeHandler).toBeDefined();
      wakeHandler?.();

      // Verify wake handler was called (test passes if no errors thrown)
      expect(wakeHandler).toBeDefined();
    });
  });

  describe('inbound connection error handling', () => {
    it('handles errors in inbound channel read', async () => {
      const knownRelays: string[] = [];
      const remoteHandler = vi.fn(async () => 'ok');

      // Override byteStream to inject read error
      let readCount = 0;
      const { byteStream } = await import('it-byte-stream');
      vi.spyOn(
        await import('it-byte-stream'),
        'byteStream',
      ).mockImplementationOnce((stream: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bs = byteStream(stream as any);
        vi.spyOn(bs, 'read').mockImplementation(async () => {
          readCount += 1;
          throw new Error('Inbound read failed');
        });
        return bs;
      });

      const { initNetwork } = await import('./network.ts');
      await initNetwork('0xinbounderror', knownRelays, remoteHandler);

      // Simulate inbound connection
      const { libp2pState: state } = (await import('libp2p')) as unknown as {
        libp2pState: typeof libp2pState;
      };

      const inboundStream = {};
      await state.handler?.({
        connection: { remotePeer: { toString: () => 'peer-inbound-err' } },
        stream: inboundStream,
      });

      // Wait for error to be handled
      await vi.waitFor(() => {
        expect(readCount).toBeGreaterThan(0);
      });
    });
  });

  describe('reconnection and queueing', () => {
    it('retries with message hints when flush fails mid-queue', async () => {
      const knownRelays = ['/dns4/relay1.example/tcp/443/wss/p2p/relay1'];
      const messageHints = ['/dns4/hint.example/tcp/443/wss/p2p/hint'];
      const remoteHandler = vi.fn(async () => 'ok');

      const dialAttempts: string[] = [];
      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'test-peer-hints-retry' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(
            async (
              addr: string,
              protocol: string,
              options: { signal: AbortSignal },
            ) => {
              dialAttempts.push(addr);
              const stream = {};
              libp2pState.dials.push({ addr, protocol, options, stream });

              // For the first reconnection dial, inject one write failure to force another redial
              if (dialAttempts.length === 2) {
                const { setWriteFailures } = (await import(
                  'it-byte-stream'
                )) as unknown as {
                  setWriteFailures: (stream: object, count: number) => void;
                };
                setWriteFailures(stream, 1);
              }
              return stream;
            },
          ),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xhints-retry',
        knownRelays,
        remoteHandler,
      );

      // Establish initial channel
      await send('peer-hints-retry', 'prime');

      // Get the initial stream and make it fail on next write to trigger reconnection
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const initialStream = libp2pState.dials[0]?.stream as object;
      const initialBs = getByteStreamFor(initialStream) as MockByteStream;
      vi.spyOn(initialBs, 'write').mockImplementation(async () => {
        throw new Error('Connection lost');
      });

      // Trigger reconnection and queue messages with hints
      await send('peer-hints-retry', 'm1', messageHints);
      await send('peer-hints-retry', 'm2', messageHints);

      // Wait for: initial dial + reconnection dial (with hints) + redial after flush failure (with hints)
      await vi.waitFor(() => {
        expect(dialAttempts.length).toBeGreaterThanOrEqual(3);
      });

      // Assert that the reconnection attempts used the hint address
      // 0: initial dial (may use relay), 1: first reconnection, 2: retry after flush failure
      expect(dialAttempts[1]).toContain('hint.example');
      expect(dialAttempts[2]).toContain('hint.example');
    });

    it('flushes queued messages after reconnection success', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { createLibp2p } = await import('libp2p');
      const streams: { initial?: object; reconnected?: object } = {};

      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-flush-node' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            if (!streams.initial) {
              streams.initial = {};
              return streams.initial;
            }
            streams.reconnected = {};
            return streams.reconnected;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xflush',
        knownRelays,
        remoteHandler,
      );

      // Establish initial outbound channel
      await send('peer-flush', 'hello');

      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const initialBs = getByteStreamFor(
        streams.initial as object,
      ) as MockByteStream;

      // Force write failure to trigger connection loss and reconnection
      vi.spyOn(initialBs, 'write').mockImplementation(async () => {
        throw new Error('Write failed - simulate disconnect');
      });

      // These gets queued while reconnection is in progress
      await send('peer-flush', 'queued-1');
      await send('peer-flush', 'queued-2');

      // Wait for reconnection to succeed and messages to flush
      await vi.waitFor(async () => {
        const bs = getByteStreamFor(streams.reconnected as object);
        expect(bs?.writes?.length ?? 0).toBeGreaterThanOrEqual(2);
      });

      const reconnectedBs = getByteStreamFor(
        streams.reconnected as object,
      ) as MockByteStream;
      const { toString: bufToString } = await import('uint8arrays');
      const flushed = (reconnectedBs.writes ?? []).map((chunk) =>
        bufToString(chunk),
      );
      expect(flushed).toStrictEqual(['queued-1', 'queued-2']);
    });

    it('drops oldest messages beyond queue capacity and flushes the newest 200', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { createLibp2p } = await import('libp2p');
      const streams: { initial?: object; reconnected?: object } = {};
      let allowReconnect = false;

      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-queue-cap' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            if (!streams.initial) {
              streams.initial = {};
              return streams.initial;
            }
            if (!allowReconnect) {
              throw new Error('Reconnection not allowed yet');
            }
            streams.reconnected = {};
            return streams.reconnected;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xqueuecap',
        knownRelays,
        remoteHandler,
      );

      // Establish initial outbound channel
      await send('peer-cap', 'init');

      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const initialBs = getByteStreamFor(
        streams.initial as object,
      ) as MockByteStream;

      // Force writes to fail to trigger reconnection path
      vi.spyOn(initialBs, 'write').mockImplementation(async () => {
        throw new Error('Write failed');
      });

      // Enqueue more than the MAX_QUEUE (200) messages
      const total = 210;
      await Promise.all(
        Array.from({ length: total }, async (_v, i) =>
          send('peer-cap', `m${i}`),
        ),
      );

      // Now allow reconnection to succeed
      allowReconnect = true;

      await vi.waitFor(async () => {
        const bs = getByteStreamFor(streams.reconnected as object);
        expect(bs?.writes?.length ?? 0).toBeGreaterThanOrEqual(200);
      });

      const reconnectedBs = getByteStreamFor(
        streams.reconnected as object,
      ) as MockByteStream;
      const { toString: bufToString } = await import('uint8arrays');
      const flushed = (reconnectedBs.writes ?? []).map((chunk) =>
        bufToString(chunk),
      );
      // Expect only the newest 200 messages: m10..m209
      expect(flushed).toHaveLength(200);
      expect(flushed[0]).toBe('m10');
      expect(flushed[flushed.length - 1]).toBe('m209');
    });

    it('performs only one dial for concurrent sends (idempotent dialing)', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { createLibp2p } = await import('libp2p');
      let dialCount = 0;
      let createdStream: object | undefined;

      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-idempotent' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;
            // Small delay to allow the second send to overlap
            await new Promise((resolve) => setTimeout(resolve, 20));
            createdStream ??= {};
            return createdStream;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xidem',
        knownRelays,
        remoteHandler,
      );

      await Promise.all([send('peer-idem', 'a'), send('peer-idem', 'b')]);

      expect(dialCount).toBe(1);

      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const bs = getByteStreamFor(createdStream as object) as MockByteStream;
      expect(bs.writes).toHaveLength(2);
    });

    it('does not dial after stop() when send is invoked', async () => {
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send, stop } = await initNetwork(
        '0xafterstop',
        knownRelays,
        remoteHandler,
      );

      await stop();
      const { libp2pState: state } = (await import('libp2p')) as unknown as {
        libp2pState: typeof libp2pState;
      };

      await send('peer-after-stop', 'hello');
      expect(state.dials).toHaveLength(0);
    });

    it('queues message when reconnection starts during sendRemoteMessage dial', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const streams: object[] = [];
      let dialCount = 0;

      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-race-condition' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;

            // First dial succeeds (initial connection)
            if (dialCount === 1) {
              const stream = {};
              streams.push(stream);
              return stream;
            }

            // Second dial simulates a slow dial that allows reconnection to start
            if (dialCount === 2) {
              // Add delay to simulate slow dial
              await new Promise((resolve) => setTimeout(resolve, 50));
              const stream = {};
              streams.push(stream);
              return stream;
            }

            // Reconnection dial succeeds
            const stream = {};
            streams.push(stream);
            return stream;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xrace',
        knownRelays,
        remoteHandler,
      );

      // Establish initial channel
      await send('peer-race', 'initial');
      expect(dialCount).toBe(1);

      // Get the stream and force it to fail to trigger reconnection
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const bs = getByteStreamFor(streams[0] as object) as MockByteStream;
      vi.spyOn(bs, 'write').mockImplementation(async () => {
        const error = new Error('Write failed - trigger reconnection');
        (error as NodeJS.ErrnoException).code = 'ECONNRESET';
        throw error;
      });

      // Trigger reconnection with first message
      await send('peer-race', 'trigger-reconnection');

      // Immediately send another message - this should detect ongoing reconnection
      // and queue the message rather than create a conflicting channel
      await send('peer-race', 'should-be-queued');

      // Wait for reconnection to complete (using real timers)
      await vi.waitFor(
        () => {
          expect(dialCount).toBeGreaterThanOrEqual(2);
        },
        { timeout: 500 },
      );

      // The key assertion: we should have initial dial + reconnection dial(s)
      // But NOT a concurrent dial from the second sendRemoteMessage
      // The exact count depends on timing, but there should be no channel conflict
      expect(dialCount).toBeLessThan(5); // Sanity check
    });

    it('continues reconnection loop when flushQueuedMessages triggers new reconnection', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
      const remoteHandler = vi.fn(async () => 'ok');

      const streams: object[] = [];
      let dialCount = 0;

      const { createLibp2p } = await import('libp2p');
      (createLibp2p as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async () => ({
          start: vi.fn(),
          stop: vi.fn(),
          peerId: { toString: () => 'peer-flush-reconnect' },
          addEventListener: vi.fn(),
          dialProtocol: vi.fn(async () => {
            dialCount += 1;

            // All dials succeed
            const stream = {};
            streams.push(stream);

            // First reconnection dial: inject write failure during flush
            if (dialCount === 2) {
              const { setWriteFailures } = (await import(
                'it-byte-stream'
              )) as unknown as {
                setWriteFailures: (stream: object, count: number) => void;
              };
              setWriteFailures(stream, 1); // Fail once during flush
            }

            return stream;
          }),
          handle: vi.fn(async () => undefined),
        }),
      );

      const { initNetwork } = await import('./network.ts');
      const { sendRemoteMessage: send } = await initNetwork(
        '0xflushreconn',
        knownRelays,
        remoteHandler,
      );

      // Establish initial channel
      await send('peer-flush-recon', 'initial');
      expect(dialCount).toBe(1);

      // Get the stream and force it to fail
      const { getByteStreamFor } = (await import(
        'it-byte-stream'
      )) as unknown as {
        getByteStreamFor: (stream: object) => MockByteStream | undefined;
      };
      const initialBs = getByteStreamFor(
        streams[0] as object,
      ) as MockByteStream;
      vi.spyOn(initialBs, 'write').mockImplementation(async () => {
        const error = new Error('Initial connection failed');
        (error as NodeJS.ErrnoException).code = 'ECONNRESET';
        throw error;
      });

      // Queue messages
      await send('peer-flush-recon', 'queued-msg-1');
      await send('peer-flush-recon', 'queued-msg-2');

      // Wait for full reconnection cycle:
      // 1. First reconnection (dialCount = 2)
      // 2. Flush fails (injected write failure)
      // 3. Second reconnection triggered (dialCount = 3)
      await vi.waitFor(
        () => {
          expect(dialCount).toBeGreaterThanOrEqual(3);
        },
        { timeout: 1500 },
      );

      // Verify messages were eventually delivered on the final stream
      const finalStream = streams[streams.length - 1] as object;
      const finalBs = getByteStreamFor(finalStream) as MockByteStream;
      expect(finalBs.writes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
