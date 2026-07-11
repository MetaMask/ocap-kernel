import { describe, it, expect, vi, beforeEach } from 'vitest';

import { libp2pNetlayerFactory } from './index.ts';

const netlayerSentinel = { peerId: 'z-self' };
const makeLibp2pNetlayerMock = vi.fn(async () => netlayerSentinel);

vi.mock('./make-libp2p-netlayer.ts', () => ({
  makeLibp2pNetlayer: async (params: unknown) => makeLibp2pNetlayerMock(params),
}));

const hooks = { handleMessage: vi.fn() };

describe('libp2pNetlayerFactory', () => {
  beforeEach(() => {
    makeLibp2pNetlayerMock.mockClear().mockResolvedValue(netlayerSentinel);
  });

  it('validates the config and delegates to makeLibp2pNetlayer', async () => {
    const result = await libp2pNetlayerFactory({
      keySeed: '0x1234',
      incarnationId: 'inc-1',
      hooks,
      config: { knownRelays: ['/ip4/127.0.0.1/tcp/9001/ws/p2p/relay'] },
    });

    expect(result).toBe(netlayerSentinel);
    expect(makeLibp2pNetlayerMock).toHaveBeenCalledWith({
      keySeed: '0x1234',
      incarnationId: 'inc-1',
      hooks,
      config: { knownRelays: ['/ip4/127.0.0.1/tcp/9001/ws/p2p/relay'] },
      logger: undefined,
    });
  });

  it('rejects an invalid config before constructing a netlayer', async () => {
    await expect(
      libp2pNetlayerFactory({
        keySeed: '0x1234',
        hooks,
        config: { maxRetryAttempts: -1 } as never,
      }),
    ).rejects.toThrow('maxRetryAttempts');
    expect(makeLibp2pNetlayerMock).not.toHaveBeenCalled();
  });
});
