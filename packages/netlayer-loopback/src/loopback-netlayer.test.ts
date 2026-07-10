import type { Netlayer, NetlayerHooks } from '@metamask/netlayer';
import { describe, it, expect, vi } from 'vitest';

import { makeLoopbackHub } from './hub.ts';
import type { LoopbackHub } from './hub.ts';
import { makeLoopbackNetlayer } from './loopback-netlayer.ts';

const SEED_A = 'aa'.repeat(32);
const SEED_B = 'bb'.repeat(32);

/**
 * Build a recording set of netlayer hooks.
 *
 * @param handleMessage - The message handler implementation.
 * @returns Hooks plus the spies for assertions.
 */
function makeHooks(handleMessage: NetlayerHooks['handleMessage']): {
  hooks: NetlayerHooks;
  onIncarnationChange: ReturnType<typeof vi.fn>;
  onRemoteGiveUp: ReturnType<typeof vi.fn>;
} {
  const onIncarnationChange = vi.fn().mockResolvedValue(false);
  const onRemoteGiveUp = vi.fn();
  return {
    hooks: { handleMessage, onIncarnationChange, onRemoteGiveUp },
    onIncarnationChange,
    onRemoteGiveUp,
  };
}

/**
 * Build a loopback netlayer bound to a hub.
 *
 * @param options - The build options.
 * @param options.hub - The shared hub.
 * @param options.keySeed - The key seed.
 * @param options.incarnationId - The incarnation id.
 * @param options.handleMessage - The inbound message handler.
 * @returns The netlayer and its incarnation callback spy.
 */
async function makeNetlayer(options: {
  hub: LoopbackHub;
  keySeed: string;
  incarnationId: string;
  handleMessage: NetlayerHooks['handleMessage'];
}): Promise<{
  netlayer: Netlayer;
  onIncarnationChange: ReturnType<typeof vi.fn>;
}> {
  const { hub, keySeed, incarnationId, handleMessage } = options;
  const { hooks, onIncarnationChange } = makeHooks(handleMessage);
  const netlayer = await makeLoopbackNetlayer({
    keySeed,
    incarnationId,
    hooks,
    config: { hub },
  });
  return { netlayer, onIncarnationChange };
}

describe('makeLoopbackNetlayer', () => {
  it('derives a stable neutral peer id from the key seed', async () => {
    const hub = makeLoopbackHub();
    const { netlayer } = await makeNetlayer({
      hub,
      keySeed: SEED_A,
      incarnationId: 'inc-a',
      handleMessage: vi.fn().mockResolvedValue(null),
    });
    expect(netlayer.peerId).toMatch(/^z/u);
  });

  it('routes a message from one peer to another and delivers the reply back', async () => {
    const hub = makeLoopbackHub();
    const receivedByB: [string, string][] = [];
    const receivedByA: [string, string][] = [];

    const { netlayer: netlayerB } = await makeNetlayer({
      hub,
      keySeed: SEED_B,
      incarnationId: 'inc-b',
      handleMessage: vi.fn(async (from: string, message: string) => {
        receivedByB.push([from, message]);
        return message === 'hello' ? 'reply-from-b' : null;
      }),
    });
    const { netlayer: netlayerA, onIncarnationChange: aOnIncarnation } =
      await makeNetlayer({
        hub,
        keySeed: SEED_A,
        incarnationId: 'inc-a',
        handleMessage: vi.fn(async (from: string, message: string) => {
          receivedByA.push([from, message]);
          return null;
        }),
      });

    await netlayerA.sendRemoteMessage(netlayerB.peerId, 'hello');

    expect(receivedByB).toStrictEqual([[netlayerA.peerId, 'hello']]);
    await vi.waitFor(() => {
      expect(receivedByA).toStrictEqual([[netlayerB.peerId, 'reply-from-b']]);
    });
    // First contact reported the target's incarnation directly.
    expect(aOnIncarnation).toHaveBeenCalledWith(netlayerB.peerId, 'inc-b');
  });

  it('reports incarnation only once per peer', async () => {
    const hub = makeLoopbackHub();
    const { netlayer: netlayerB } = await makeNetlayer({
      hub,
      keySeed: SEED_B,
      incarnationId: 'inc-b',
      handleMessage: vi.fn().mockResolvedValue(null),
    });
    const { netlayer: netlayerA, onIncarnationChange } = await makeNetlayer({
      hub,
      keySeed: SEED_A,
      incarnationId: 'inc-a',
      handleMessage: vi.fn().mockResolvedValue(null),
    });

    await netlayerA.sendRemoteMessage(netlayerB.peerId, 'one');
    await netlayerA.sendRemoteMessage(netlayerB.peerId, 'two');
    expect(onIncarnationChange).toHaveBeenCalledTimes(1);
  });

  it('throws when sending to an unregistered peer', async () => {
    const hub = makeLoopbackHub();
    const { netlayer } = await makeNetlayer({
      hub,
      keySeed: SEED_A,
      incarnationId: 'inc-a',
      handleMessage: vi.fn().mockResolvedValue(null),
    });
    await expect(
      netlayer.sendRemoteMessage('zNotARegisteredPeer', 'hi'),
    ).rejects.toThrow('Cannot deliver to unregistered peer');
  });

  it('throws IntentionalCloseError after closeConnection and recovers after reconnectPeer', async () => {
    const hub = makeLoopbackHub();
    const { netlayer: netlayerB } = await makeNetlayer({
      hub,
      keySeed: SEED_B,
      incarnationId: 'inc-b',
      handleMessage: vi.fn().mockResolvedValue(null),
    });
    const { netlayer: netlayerA } = await makeNetlayer({
      hub,
      keySeed: SEED_A,
      incarnationId: 'inc-a',
      handleMessage: vi.fn().mockResolvedValue(null),
    });

    await netlayerA.closeConnection(netlayerB.peerId);
    await expect(
      netlayerA.sendRemoteMessage(netlayerB.peerId, 'hi'),
    ).rejects.toThrow('intentional');

    await netlayerA.reconnectPeer(netlayerB.peerId);
    expect(
      await netlayerA.sendRemoteMessage(netlayerB.peerId, 'hi'),
    ).toBeUndefined();
  });

  it('throws NetworkStoppedError after stop and unregisters from the hub', async () => {
    const hub = makeLoopbackHub();
    const { netlayer } = await makeNetlayer({
      hub,
      keySeed: SEED_A,
      incarnationId: 'inc-a',
      handleMessage: vi.fn().mockResolvedValue(null),
    });
    const { peerId } = netlayer;
    expect(hub.getIncarnation(peerId)).toBe('inc-a');

    await netlayer.stop();

    expect(hub.getIncarnation(peerId)).toBeUndefined();
    await expect(netlayer.sendRemoteMessage('z-any', 'hi')).rejects.toThrow(
      'stopped',
    );
  });

  it('exposes inert connection-management methods', async () => {
    const hub = makeLoopbackHub();
    const { netlayer } = await makeNetlayer({
      hub,
      keySeed: SEED_A,
      incarnationId: 'inc-a',
      handleMessage: vi.fn().mockResolvedValue(null),
    });
    expect(netlayer.getListenAddresses()).toStrictEqual([]);
    expect(netlayer.registerLocationHints('z-peer', ['hint'])).toBeUndefined();
    expect(netlayer.resetAllBackoffs()).toBeUndefined();
    expect(await netlayer.reconnectPeer('z-peer')).toBeUndefined();
  });

  it('falls back to config.incarnationId then peerId when no top-level incarnation is given', async () => {
    const hub = makeLoopbackHub();
    const netlayer = await makeLoopbackNetlayer({
      keySeed: SEED_A,
      hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
      config: { hub, incarnationId: 'from-config' },
    });
    expect(hub.getIncarnation(netlayer.peerId)).toBe('from-config');

    const hub2 = makeLoopbackHub();
    const netlayer2 = await makeLoopbackNetlayer({
      keySeed: SEED_B,
      hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
      config: { hub: hub2 },
    });
    expect(hub2.getIncarnation(netlayer2.peerId)).toBe(netlayer2.peerId);
  });

  describe('config validation', () => {
    it('throws when the hub is missing', async () => {
      await expect(
        makeLoopbackNetlayer({
          keySeed: SEED_A,
          hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
          // @ts-expect-error deliberately invalid config
          config: {},
        }),
      ).rejects.toThrow('requires a hub');
    });

    it('throws when incarnationId is not a string', async () => {
      const hub = makeLoopbackHub();
      await expect(
        makeLoopbackNetlayer({
          keySeed: SEED_A,
          hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
          // @ts-expect-error deliberately invalid incarnationId
          config: { hub, incarnationId: 42 },
        }),
      ).rejects.toThrow('incarnationId');
    });
  });
});
