import { is } from '@metamask/superstruct';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  initRemoteCommsHandler,
  initRemoteCommsSpec,
} from './init-remote-comms.ts';
import type { Kernel } from '../../Kernel.ts';

describe('initRemoteCommsHandler', () => {
  let mockKernel: Kernel;

  beforeEach(() => {
    mockKernel = {
      initRemoteComms: vi.fn().mockResolvedValue(undefined),
    } as unknown as Kernel;
  });

  it('calls initRemoteComms with empty options and returns null', async () => {
    const result = await initRemoteCommsHandler.implementation(
      { kernel: mockKernel },
      {},
    );

    expect(mockKernel.initRemoteComms).toHaveBeenCalledWith({});
    expect(result).toBeNull();
  });

  it('passes relays option', async () => {
    const result = await initRemoteCommsHandler.implementation(
      { kernel: mockKernel },
      { relays: ['/dns4/relay.example.com/tcp/443/wss/p2p/QmRelay'] },
    );

    expect(mockKernel.initRemoteComms).toHaveBeenCalledWith({
      relays: ['/dns4/relay.example.com/tcp/443/wss/p2p/QmRelay'],
    });
    expect(result).toBeNull();
  });

  it('passes directListenAddresses option', async () => {
    const result = await initRemoteCommsHandler.implementation(
      { kernel: mockKernel },
      { directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'] },
    );

    expect(mockKernel.initRemoteComms).toHaveBeenCalledWith({
      directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
    });
    expect(result).toBeNull();
  });

  it('passes all options', async () => {
    const params = {
      relays: ['relay1'],
      directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
      maxRetryAttempts: 5,
      maxQueue: 100,
    };

    const result = await initRemoteCommsHandler.implementation(
      { kernel: mockKernel },
      params,
    );

    expect(mockKernel.initRemoteComms).toHaveBeenCalledWith({
      relays: ['relay1'],
      directListenAddresses: ['/ip4/0.0.0.0/udp/0/quic-v1'],
      maxRetryAttempts: 5,
      maxQueue: 100,
    });
    expect(result).toBeNull();
  });

  it('propagates errors from kernel.initRemoteComms', async () => {
    const error = new Error('Remote comms initialization failed');
    vi.mocked(mockKernel.initRemoteComms).mockRejectedValueOnce(error);

    await expect(
      initRemoteCommsHandler.implementation({ kernel: mockKernel }, {}),
    ).rejects.toThrow(error);
  });

  describe('params validation', () => {
    it('accepts valid params', () => {
      expect(is({}, initRemoteCommsSpec.params)).toBe(true);
      expect(
        is({ maxRetryAttempts: 0, maxQueue: 0 }, initRemoteCommsSpec.params),
      ).toBe(true);
      expect(
        is({ maxRetryAttempts: 5, maxQueue: 100 }, initRemoteCommsSpec.params),
      ).toBe(true);
    });

    it.each([-1, -100, 1.5, 3.14, -0.5])(
      'rejects invalid maxRetryAttempts value: %s',
      (value) => {
        expect(
          is({ maxRetryAttempts: value }, initRemoteCommsSpec.params),
        ).toBe(false);
      },
    );

    it.each([-1, -100, 1.5, 3.14, -0.5])(
      'rejects invalid maxQueue value: %s',
      (value) => {
        expect(is({ maxQueue: value }, initRemoteCommsSpec.params)).toBe(false);
      },
    );
  });
});
