import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeLibp2pNetlayer } from './make-libp2p-netlayer.ts';

// A stand-in for the netlayer the engine returns; identity comes from the provider.
const netlayerSentinel = {
  peerId: 'z-self',
  sendRemoteMessage: vi.fn(),
  stop: vi.fn(),
  closeConnection: vi.fn(),
  registerLocationHints: vi.fn(),
  reconnectPeer: vi.fn(),
  resetAllBackoffs: vi.fn(),
  getListenAddresses: vi.fn(),
};

const mockProvider = {
  peerId: 'z-self',
  dial: vi.fn(),
  onInboundChannel: vi.fn(),
  onPeerDisconnect: vi.fn(),
  closeChannel: vi.fn(),
  getListenAddresses: vi.fn(),
  stop: vi.fn(),
};

const makeConnectionFactory = vi.fn(async () => mockProvider);
const makeChannelNetlayerMock = vi.fn(() => netlayerSentinel);

vi.mock('./connection-factory.ts', () => ({
  ConnectionFactory: {
    make: async (options: unknown) => makeConnectionFactory(options),
  },
}));

vi.mock('@metamask/netlayer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@metamask/netlayer')>()),
  makeChannelNetlayer: (params: unknown) => makeChannelNetlayerMock(params),
}));

const hooks = { handleMessage: vi.fn() };

describe('makeLibp2pNetlayer', () => {
  beforeEach(() => {
    makeConnectionFactory.mockClear().mockResolvedValue(mockProvider);
    makeChannelNetlayerMock.mockClear().mockReturnValue(netlayerSentinel);
  });

  it('constructs the ConnectionFactory with the provider-owned options', async () => {
    const directTransports = [
      {
        transport: { tag: 'quic' },
        listenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
      },
    ];
    await makeLibp2pNetlayer({
      keySeed: '0xabcd',
      hooks,
      config: {
        knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
        maxRetryAttempts: 5,
        allowedWsHosts: ['relay.example'],
      },
      directTransports,
    });

    expect(makeConnectionFactory).toHaveBeenCalledWith({
      keySeed: '0xabcd',
      knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
      logger: expect.any(Object),
      signal: expect.any(AbortSignal),
      maxRetryAttempts: 5,
      maxMessageSizeBytes: 1024 * 1024,
      directTransports,
      allowedWsHosts: ['relay.example'],
    });
  });

  it('defaults knownRelays to an empty array and message size to 1MB', async () => {
    await makeLibp2pNetlayer({ keySeed: '0x1234', hooks, config: {} });

    expect(makeConnectionFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        knownRelays: [],
        maxMessageSizeBytes: 1024 * 1024,
        directTransports: undefined,
        allowedWsHosts: undefined,
      }),
    );
  });

  it('honors an explicit maxMessageSizeBytes', async () => {
    await makeLibp2pNetlayer({
      keySeed: '0x1234',
      hooks,
      config: { maxMessageSizeBytes: 42 },
    });

    expect(makeConnectionFactory).toHaveBeenCalledWith(
      expect.objectContaining({ maxMessageSizeBytes: 42 }),
    );
  });

  it('delegates to makeChannelNetlayer with the mapped engine options and hooks', async () => {
    const result = await makeLibp2pNetlayer({
      keySeed: '0x1234',
      incarnationId: 'incarnation-x',
      hooks,
      config: {
        maxConcurrentConnections: 7,
        cleanupIntervalMs: 111,
        streamInactivityTimeoutMs: 222,
      },
    });

    expect(makeChannelNetlayerMock).toHaveBeenCalledWith({
      provider: mockProvider,
      hooks,
      options: expect.objectContaining({
        maxConcurrentConnections: 7,
        cleanupIntervalMs: 111,
        streamInactivityTimeoutMs: 222,
        localIncarnationId: 'incarnation-x',
      }),
      logger: expect.any(Object),
      stopController: expect.any(AbortController),
    });
    expect(result).toBe(netlayerSentinel);
  });
});
