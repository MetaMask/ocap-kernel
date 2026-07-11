import { fromHex } from '@metamask/kernel-utils';
import { deriveNeutralPeerId } from '@metamask/netlayer';
import { makeLoopbackHub } from '@metamask/netlayer-loopback';
import { describe, it, expect, vi } from 'vitest';

import { makeLoopbackPlatformServices } from '../../test/loopback-platform-services.ts';

const SEED_A = 'a1'.repeat(32);
const SEED_B = 'b2'.repeat(32);

describe('loopback remote comms', () => {
  it('carries a message and its reply between two in-process kernels', async () => {
    const hub = makeLoopbackHub();
    const peerA = deriveNeutralPeerId(fromHex(SEED_A));
    const peerB = deriveNeutralPeerId(fromHex(SEED_B));

    const receivedByA: [string, string][] = [];
    const receivedByB: [string, string][] = [];

    const platformServicesA = makeLoopbackPlatformServices({ hub });
    const platformServicesB = makeLoopbackPlatformServices({ hub });

    await platformServicesB.initializeRemoteComms({
      keySeed: SEED_B,
      specifier: { netlayer: 'loopback', config: {} },
      hooks: {
        handleMessage: async (from: string, message: string) => {
          receivedByB.push([from, message]);
          return message === 'ping' ? 'pong' : null;
        },
      },
      incarnationId: 'incarnation-b',
    });
    await platformServicesA.initializeRemoteComms({
      keySeed: SEED_A,
      specifier: { netlayer: 'loopback', config: {} },
      hooks: {
        handleMessage: async (from: string, message: string) => {
          receivedByA.push([from, message]);
          return null;
        },
      },
      incarnationId: 'incarnation-a',
    });

    await platformServicesA.sendRemoteMessage(peerB, 'ping');

    // B received the message from A over the loopback hub.
    expect(receivedByB).toStrictEqual([[peerA, 'ping']]);
    // B's reply routed back into A's inbound path.
    await vi.waitFor(() => {
      expect(receivedByA).toStrictEqual([[peerB, 'pong']]);
    });
  });

  it('forwards connection-management calls to the netlayer', async () => {
    const hub = makeLoopbackHub();
    const peerB = deriveNeutralPeerId(fromHex(SEED_B));
    const platformServicesB = makeLoopbackPlatformServices({ hub });
    const platformServicesA = makeLoopbackPlatformServices({ hub });
    await platformServicesB.initializeRemoteComms({
      keySeed: SEED_B,
      specifier: { netlayer: 'loopback', config: {} },
      hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
      incarnationId: 'incarnation-b',
    });
    await platformServicesA.initializeRemoteComms({
      keySeed: SEED_A,
      specifier: { netlayer: 'loopback', config: {} },
      hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
      incarnationId: 'incarnation-a',
    });

    expect(platformServicesA.getListenAddresses()).toStrictEqual([]);
    expect(
      await platformServicesA.registerLocationHints(peerB, ['hint']),
    ).toBeUndefined();
    expect(await platformServicesA.resetAllBackoffs()).toBeUndefined();

    // closeConnection makes further sends throw; reconnectPeer clears that.
    await platformServicesA.closeConnection(peerB);
    await expect(
      platformServicesA.sendRemoteMessage(peerB, 'blocked'),
    ).rejects.toThrow('intentional');
    await platformServicesA.reconnectPeer(peerB);
    expect(
      await platformServicesA.sendRemoteMessage(peerB, 'ok'),
    ).toBeUndefined();
  });

  it('returns no listen addresses before initialization', () => {
    const hub = makeLoopbackHub();
    const platformServices = makeLoopbackPlatformServices({ hub });
    expect(platformServices.getListenAddresses()).toStrictEqual([]);
  });

  it('throws when sending before remote comms is initialized', async () => {
    const hub = makeLoopbackHub();
    const platformServices = makeLoopbackPlatformServices({ hub });
    await expect(
      platformServices.sendRemoteMessage('z-peer', 'hi'),
    ).rejects.toThrow('not initialized');
  });

  it('stops remote comms and unregisters from the hub', async () => {
    const hub = makeLoopbackHub();
    const peerA = deriveNeutralPeerId(fromHex(SEED_A));
    const platformServices = makeLoopbackPlatformServices({ hub });
    await platformServices.initializeRemoteComms({
      keySeed: SEED_A,
      specifier: { netlayer: 'loopback', config: {} },
      hooks: { handleMessage: vi.fn().mockResolvedValue(null) },
      incarnationId: 'incarnation-a',
    });
    expect(hub.getIncarnation(peerA)).toBe('incarnation-a');

    await platformServices.stopRemoteComms();
    expect(hub.getIncarnation(peerA)).toBeUndefined();
  });
});
