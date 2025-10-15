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
}));

vi.mock('@metamask/logger', () => ({
  Logger: class {
    log = vi.fn();
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
vi.mock('it-byte-stream', () => ({
  byteStream: (stream: object) => {
    let pending: ((c: Uint8Array) => void) | undefined;
    const queue: Uint8Array[] = [];
    const bs: MockByteStream = {
      writes: [],
      async write(chunk: Uint8Array) {
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

describe('network.initNetwork', () => {
  beforeEach(() => {
    libp2pState.dials = [];
    libp2pState.handler = undefined;
    generateKeyPairFromSeed.mockClear();
  });

  it('returns a sender that opens a channel once and writes', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    const { initNetwork } = await import('./network.ts');
    const send = await initNetwork('0x1234', knownRelays, remoteHandler);

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
    const send = await initNetwork('0xabcd', knownRelays, remoteHandler);
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
    const send = await initNetwork('0xfallback', knownRelays, remoteHandler);

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
    const send = await initNetwork('0xdeadbeef', knownRelays, remoteHandler);

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
    const send = await initNetwork('0xnoproblem', knownRelays, remoteHandler);

    expect(await send('peer-no-problem', 'msg')).toBeUndefined();
  });

  it('handles write errors when sending messages', async () => {
    const knownRelays = ['/dns4/relay.example/tcp/443/wss/p2p/relayPeer'];
    const remoteHandler = vi.fn(async () => 'ok');

    const { initNetwork } = await import('./network.ts');
    const send = await initNetwork('0xwriteerror', knownRelays, remoteHandler);

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
    const send = await initNetwork('0xtimeout', knownRelays, remoteHandler);

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
    const send = await initNetwork('0xmultirelays', knownRelays, remoteHandler);

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
});
