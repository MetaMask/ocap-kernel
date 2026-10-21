import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { delay } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { describe, it, expect, vi } from 'vitest';

import { initRemoteComms } from './remote-comms.ts';
import { RemoteManager } from './RemoteManager.ts';
import { KernelQueue } from '../../KernelQueue.ts';
import { makeKernelStore } from '../../store/index.ts';
import type {
  CrankResult,
  PlatformServices,
  RunLoopItem,
} from '../../types.ts';
import type { RemoteComms } from '../types.ts';

vi.mock('./remote-comms.ts', async () => {
  const actual = await vi.importActual('./remote-comms.ts');
  return { ...actual, initRemoteComms: vi.fn() };
});

const PEER_ID = '12D3KooWPeer1';

/**
 * A real store and run loop, a RemoteManager over them, and a remote for
 * `PEER_ID`.
 *
 * @returns The pieces a test drives.
 */
async function setUp() {
  const kernelStore = makeKernelStore(
    await makeSQLKernelDatabase({ dbFilename: ':memory:' }),
  );
  const kernelQueue = new KernelQueue(kernelStore, async () => undefined);
  const logger = new Logger('test');
  for (const level of ['log', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(logger, level).mockImplementation(() => undefined);
  }
  vi.spyOn(logger, 'subLogger').mockReturnValue(logger);
  const sent: string[] = [];
  const remoteComms = {
    getPeerId: vi.fn().mockReturnValue('local-peer'),
    sendRemoteMessage: vi.fn(async (_to: string, message: string) => {
      sent.push(message);
    }),
    registerLocationHints: vi.fn().mockResolvedValue(undefined),
  } as unknown as RemoteComms;
  vi.mocked(initRemoteComms).mockResolvedValue(remoteComms);
  const remoteManager = new RemoteManager({
    platformServices: {} as PlatformServices,
    kernelStore,
    kernelQueue,
    logger,
  });
  remoteManager.setMessageHandler(vi.fn());
  await remoteManager.initRemoteComms();
  const onIncarnationChange = vi.mocked(initRemoteComms).mock.lastCall?.[8] as (
    peerId: string,
    incarnation: string,
  ) => Promise<boolean>;
  const remote = remoteManager.establishRemote(PEER_ID);

  // Each sequence number a crank took delivery of, rather than dropped.
  const taken: number[] = [];
  const deliver = async (
    item: RunLoopItem,
  ): Promise<CrankResult | undefined> => {
    if (item.type === 'remoteInbound') {
      const result = await remoteManager
        .getRemote(item.remoteId)
        .deliverInbound(item.message);
      if (result.afterCommit) {
        taken.push(item.seq);
      }
      return result;
    }
    if (item.type === 'peerIncarnation') {
      return remoteManager.applyIncarnationChange(item);
    }
    return undefined;
  };

  return {
    kernelStore,
    kernelQueue,
    remoteManager,
    remote,
    onIncarnationChange,
    taken,
    sent,
    startRunLoop: async () => kernelQueue.run(deliver),
  };
}

/**
 * A message from the peer that writes nothing beyond its own receipt.
 *
 * @param seq - Its sequence number.
 * @returns The message as it arrives.
 */
function emptyNotify(seq: number): string {
  return JSON.stringify({ seq, method: 'deliver', params: ['notify', []] });
}

/**
 * Let the run loop take everything waiting.
 */
async function settle(): Promise<void> {
  await delay(20);
}

/**
 * @param sent - The messages the remote handed to the transport.
 * @returns The sequence number of each, in order.
 */
function sentSeqs(sent: string[]): number[] {
  return sent.flatMap((message) => {
    const { seq } = JSON.parse(message) as { seq?: number };
    return seq === undefined ? [] : [seq];
  });
}

describe('a peer incarnation change on the run loop', () => {
  it('takes a message read off the old channel after the restart handshake against the old incarnation', async () => {
    const harness = await setUp();
    const { remoteManager, onIncarnationChange, taken, sent } = harness;
    harness.startRunLoop().catch(() => undefined);
    expect(await onIncarnationChange(PEER_ID, 'incarnation-A')).toBe(false);
    for (const seq of [1, 2, 3]) {
      await remoteManager.handleRemoteMessage(PEER_ID, emptyNotify(seq));
    }
    await settle();

    // The old channel still holds a message, which its reader hands over
    // once the handshake has queued the change.
    const verdict = onIncarnationChange(PEER_ID, 'incarnation-B');
    await remoteManager.handleRemoteMessage(PEER_ID, emptyNotify(4));
    expect(await verdict).toBe(true);
    await settle();
    expect(await onIncarnationChange(PEER_ID, 'incarnation-B')).toBe(false);
    for (const seq of [1, 2, 3, 4, 5]) {
      await remoteManager.handleRemoteMessage(PEER_ID, emptyNotify(seq));
    }
    await settle();
    // The delayed standalone ACK.
    await delay(100);

    expect({ taken, lastSent: sent.at(-1) }).toStrictEqual({
      taken: [1, 2, 3, 4, 1, 2, 3, 4, 5],
      lastSent: '{"ack":5}',
    });
    remoteManager.cleanup();
  });

  it('drops a copy of a taken message read off the old channel after the restart handshake', async () => {
    const harness = await setUp();
    const { remoteManager, onIncarnationChange, taken } = harness;
    harness.startRunLoop().catch(() => undefined);
    expect(await onIncarnationChange(PEER_ID, 'incarnation-A')).toBe(false);
    for (const seq of [1, 2, 3]) {
      await remoteManager.handleRemoteMessage(PEER_ID, emptyNotify(seq));
    }
    await settle();

    const verdict = onIncarnationChange(PEER_ID, 'incarnation-B');
    await remoteManager.handleRemoteMessage(PEER_ID, emptyNotify(2));
    expect(await verdict).toBe(true);
    await settle();

    expect(taken).toStrictEqual([1, 2, 3]);
    remoteManager.cleanup();
  });

  it('holds what it sends to a peer that restarts before its first incarnation is recorded', async () => {
    const harness = await setUp();
    const { kernelStore, remoteManager, remote, onIncarnationChange, sent } =
      harness;
    expect(await onIncarnationChange(PEER_ID, 'incarnation-B')).toBe(false);

    expect(await onIncarnationChange(PEER_ID, 'incarnation-C')).toBe(true);
    remote.redeemOcapURL('ocap:x@peer').catch(() => undefined);
    await delay(5);
    expect(sentSeqs(sent)).toStrictEqual([]);

    harness.startRunLoop().catch(() => undefined);
    await settle();
    remote.redeemOcapURL('ocap:y@peer').catch(() => undefined);
    await delay(5);

    expect({
      incarnation: kernelStore.getPeerIncarnation(PEER_ID),
      sent: sentSeqs(sent),
    }).toStrictEqual({ incarnation: 'incarnation-C', sent: [1] });
    remoteManager.cleanup();
  });

  it('stops the run loop when the restart cannot be recorded', async () => {
    const harness = await setUp();
    const { kernelStore, remoteManager, remote, onIncarnationChange } = harness;
    kernelStore.setPeerIncarnation(PEER_ID, 'incarnation-A');
    vi.spyOn(remote, 'persistPeerRestart').mockImplementation(() => {
      throw new Error('refcount underflow');
    });
    const running = harness.startRunLoop();

    expect(await onIncarnationChange(PEER_ID, 'incarnation-B')).toBe(true);

    await expect(running).rejects.toThrow('refcount underflow');
    expect(kernelStore.getPeerIncarnation(PEER_ID)).toBe('incarnation-A');
    remoteManager.cleanup();
  });
});
