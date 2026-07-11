import { is } from '@metamask/superstruct';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  initRemoteCommsHandler,
  initRemoteCommsSpec,
} from './init-remote-comms.ts';
import type { Kernel } from '../../Kernel.ts';

const specifier = {
  netlayer: 'libp2p',
  config: { knownRelays: ['/dns4/relay.example/tcp/443/wss/p2p/relay'] },
};

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

  it('passes a specifier through to the kernel', async () => {
    const result = await initRemoteCommsHandler.implementation(
      { kernel: mockKernel },
      { specifier },
    );

    expect(mockKernel.initRemoteComms).toHaveBeenCalledWith({ specifier });
    expect(result).toBeNull();
  });

  it('passes kernel-level options', async () => {
    const params = {
      specifier,
      maxQueue: 100,
      ackTimeoutMs: 5000,
      maxUrlRelayHints: 3,
      maxKnownRelays: 20,
    };

    const result = await initRemoteCommsHandler.implementation(
      { kernel: mockKernel },
      params,
    );

    expect(mockKernel.initRemoteComms).toHaveBeenCalledWith(params);
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
      expect(is({ specifier }, initRemoteCommsSpec.params)).toBe(true);
      expect(
        is({ maxQueue: 0, ackTimeoutMs: 0 }, initRemoteCommsSpec.params),
      ).toBe(true);
    });

    it('rejects a specifier with a non-string netlayer', () => {
      expect(
        is(
          { specifier: { netlayer: 1, config: {} } },
          initRemoteCommsSpec.params,
        ),
      ).toBe(false);
    });

    it.each([-1, 1.5, -0.5])('rejects invalid maxQueue value: %s', (value) => {
      expect(is({ maxQueue: value }, initRemoteCommsSpec.params)).toBe(false);
    });

    it.each([0, -1, 1.5])(
      'rejects invalid maxUrlRelayHints value: %s',
      (value) => {
        expect(
          is({ maxUrlRelayHints: value }, initRemoteCommsSpec.params),
        ).toBe(false);
      },
    );

    it.each([1, 20, 100])('accepts valid maxKnownRelays value: %s', (value) => {
      expect(is({ maxKnownRelays: value }, initRemoteCommsSpec.params)).toBe(
        true,
      );
    });
  });
});
