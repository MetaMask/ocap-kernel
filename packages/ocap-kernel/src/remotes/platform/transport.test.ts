import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initTransport } from './transport.ts';

// A stand-in for the netlayer the libp2p factory returns.
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

const makeLibp2pNetlayerMock = vi.fn(async () => netlayerSentinel);

vi.mock('@metamask/netlayer-libp2p', () => ({
  makeLibp2pNetlayer: async (params: unknown) => makeLibp2pNetlayerMock(params),
}));

describe('initTransport (compatibility shim)', () => {
  beforeEach(() => {
    makeLibp2pNetlayerMock.mockClear().mockResolvedValue(netlayerSentinel);
  });

  it('maps relays and direct transports into the libp2p netlayer config', async () => {
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

    expect(makeLibp2pNetlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        keySeed: '0xabcd',
        directTransports,
        config: expect.objectContaining({
          knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relay1'],
          maxRetryAttempts: 5,
          allowedWsHosts: ['relay.example'],
        }),
      }),
    );
  });

  it('does not forward kernel-level options into the netlayer config', async () => {
    await initTransport(
      '0x1234',
      {
        mnemonic: 'secret words',
        maxQueue: 10,
        ackTimeoutMs: 1000,
        maxUrlRelayHints: 3,
        maxKnownRelays: 20,
        maxMessageSizeBytes: 42,
      },
      vi.fn(),
    );

    const [{ config }] = makeLibp2pNetlayerMock.mock.calls[0] as [
      { config: Record<string, unknown> },
    ];
    expect(config).toStrictEqual({
      knownRelays: undefined,
      maxMessageSizeBytes: 42,
    });
  });

  it('maps positional handler and callbacks into hooks and returns the netlayer', async () => {
    const handleMessage = vi.fn();
    const onRemoteGiveUp = vi.fn();
    const onIncarnationChange = vi.fn();
    const result = await initTransport(
      '0x1234',
      { maxConcurrentConnections: 7 },
      handleMessage,
      onRemoteGiveUp,
      'incarnation-x',
      onIncarnationChange,
    );

    expect(makeLibp2pNetlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        incarnationId: 'incarnation-x',
        hooks: { handleMessage, onRemoteGiveUp, onIncarnationChange },
      }),
    );
    expect(result).toBe(netlayerSentinel);
  });
});
