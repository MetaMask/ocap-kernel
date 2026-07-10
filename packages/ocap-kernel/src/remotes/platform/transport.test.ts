import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initTransport } from './transport.ts';

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

describe('initTransport', () => {
  beforeEach(() => {
    makeConnectionFactory.mockClear().mockResolvedValue(mockProvider);
    makeChannelNetlayerMock.mockClear().mockReturnValue(netlayerSentinel);
  });

  it('constructs the libp2p ConnectionFactory with the provider options', async () => {
    const directTransports = [
      {
        transport: { tag: 'quic' },
        listenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
      },
    ];
    await initTransport(
      '0xabcd',
      {
        relays: ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
        maxRetryAttempts: 5,
        directTransports,
        allowedWsHosts: ['relay.example'],
      },
      vi.fn(),
    );

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

  it('defaults relays to an empty array and message size to 1MB', async () => {
    await initTransport('0x1234', {}, vi.fn());

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
    await initTransport('0x1234', { maxMessageSizeBytes: 42 }, vi.fn());

    expect(makeConnectionFactory).toHaveBeenCalledWith(
      expect.objectContaining({ maxMessageSizeBytes: 42 }),
    );
  });

  it('delegates to makeChannelNetlayer with the mapped engine options and hooks', async () => {
    const handleMessage = vi.fn();
    const onRemoteGiveUp = vi.fn();
    const onIncarnationChange = vi.fn();
    const result = await initTransport(
      '0x1234',
      {
        maxConcurrentConnections: 7,
        cleanupIntervalMs: 111,
        streamInactivityTimeoutMs: 222,
      },
      handleMessage,
      onRemoteGiveUp,
      'incarnation-x',
      onIncarnationChange,
    );

    expect(makeChannelNetlayerMock).toHaveBeenCalledWith({
      provider: mockProvider,
      hooks: { handleMessage, onRemoteGiveUp, onIncarnationChange },
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
