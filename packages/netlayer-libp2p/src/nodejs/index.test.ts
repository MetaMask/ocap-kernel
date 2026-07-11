import { describe, it, expect, vi, beforeEach } from 'vitest';

import { nodejsLibp2pNetlayerFactory } from './index.ts';

const netlayerSentinel = { peerId: 'z-self' };
const makeLibp2pNetlayerMock = vi.fn(async () => netlayerSentinel);

vi.mock('../make-libp2p-netlayer.ts', () => ({
  makeLibp2pNetlayer: async (params: unknown) => makeLibp2pNetlayerMock(params),
}));

vi.mock('./direct-transports.ts', () => ({
  buildDirectTransports: (addrs: string[]) =>
    addrs.map((addr) => ({ transport: { addr }, listenAddresses: [addr] })),
}));

const hooks = { handleMessage: vi.fn() };

describe('nodejsLibp2pNetlayerFactory', () => {
  beforeEach(() => {
    makeLibp2pNetlayerMock.mockClear().mockResolvedValue(netlayerSentinel);
  });

  it('builds direct transports from directListenAddresses and delegates', async () => {
    const result = await nodejsLibp2pNetlayerFactory({
      keySeed: '0x1234',
      hooks,
      config: { directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'] },
    });

    expect(result).toBe(netlayerSentinel);
    expect(makeLibp2pNetlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        keySeed: '0x1234',
        directTransports: [
          {
            transport: { addr: '/ip4/0.0.0.0/udp/0/quic-v1' },
            listenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
          },
        ],
      }),
    );
  });

  it('defaults to no direct transports when none are configured', async () => {
    await nodejsLibp2pNetlayerFactory({ keySeed: '0x1234', hooks, config: {} });

    expect(makeLibp2pNetlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({ directTransports: [] }),
    );
  });

  it('rejects an invalid config', async () => {
    await expect(
      nodejsLibp2pNetlayerFactory({
        keySeed: '0x1234',
        hooks,
        config: { maxMessageSizeBytes: 0 } as never,
      }),
    ).rejects.toThrow('maxMessageSizeBytes');
    expect(makeLibp2pNetlayerMock).not.toHaveBeenCalled();
  });
});
