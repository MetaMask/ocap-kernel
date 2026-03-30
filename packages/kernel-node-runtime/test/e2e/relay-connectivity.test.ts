import type { Libp2p } from '@libp2p/interface';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { startRelay } from '@metamask/kernel-utils/libp2p';
import { Kernel } from '@metamask/ocap-kernel';
import type { KernelStatus } from '@metamask/ocap-kernel';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';

const STOP_TIMEOUT = 5_000;
const TEST_TIMEOUT = 30_000;
const RELAY_PEER_ID = '12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc';

async function stopWithTimeout(
  fn: () => Promise<void>,
  timeout: number,
): Promise<void> {
  await Promise.race([
    fn(),
    new Promise<void>((resolve) => setTimeout(resolve, timeout)),
  ]);
}

function getRemoteCommsPeerId(
  remoteComms: KernelStatus['remoteComms'],
): string | undefined {
  if (remoteComms && remoteComms.state !== 'disconnected') {
    return remoteComms.peerId;
  }
  return undefined;
}

describe('Relay Connectivity', () => {
  let relay: Libp2p;
  let relayAddr: string;

  beforeAll(async () => {
    relay = await startRelay(console);
    const wsAddr = relay
      .getMultiaddrs()
      .find((ma) => ma.toString().includes('/ip4/127.0.0.1/tcp/9001/ws/'));
    if (!wsAddr) {
      throw new Error(
        'Relay started but no WS multiaddr found on 127.0.0.1:9001',
      );
    }
    relayAddr = wsAddr.toString();
  }, 15_000);

  afterAll(async () => {
    if (relay) {
      await stopWithTimeout(async () => relay.stop(), STOP_TIMEOUT);
    }
  }, 10_000);

  it('starts relay with expected peer ID', () => {
    expect(relay.peerId.toString()).toBe(RELAY_PEER_ID);

    const addrs = relay.getMultiaddrs().map((ma) => ma.toString());
    expect(addrs.some((a) => a.includes('/ws/'))).toBe(true);
    expect(addrs.some((a) => a.includes('/tcp/9002/'))).toBe(true);
  });

  it(
    'kernel connects to relay and obtains a peer ID',
    async () => {
      const kernelDb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
      let kernel: Kernel | undefined;

      try {
        kernel = await makeTestKernel(kernelDb);
        await kernel.initRemoteComms({ relays: [relayAddr] });

        const status = await kernel.getStatus();
        expect(status.remoteComms?.state).toBe('connected');
        const peerId = getRemoteCommsPeerId(status.remoteComms);
        expect(peerId).toBeDefined();
        expect(typeof peerId).toBe('string');
        console.log(`Kernel connected to relay with peerId: ${peerId}`);
      } finally {
        if (kernel) {
          await kernel.stop();
        }
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'two kernels can discover each other via the relay',
    async () => {
      const kernelDb1 = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
      const kernelDb2 = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
      let kernel1: Kernel | undefined;
      let kernel2: Kernel | undefined;

      try {
        kernel1 = await makeTestKernel(kernelDb1);
        kernel2 = await makeTestKernel(kernelDb2);

        await kernel1.initRemoteComms({ relays: [relayAddr] });
        await kernel2.initRemoteComms({ relays: [relayAddr] });

        const status1 = await kernel1.getStatus();
        const status2 = await kernel2.getStatus();

        expect(status1.remoteComms?.state).toBe('connected');
        expect(status2.remoteComms?.state).toBe('connected');

        const peerId1 = getRemoteCommsPeerId(status1.remoteComms);
        const peerId2 = getRemoteCommsPeerId(status2.remoteComms);

        expect(peerId1).toBeDefined();
        expect(peerId2).toBeDefined();
        expect(peerId1).not.toBe(peerId2);

        console.log(`Kernel 1 peerId: ${peerId1}`);
        console.log(`Kernel 2 peerId: ${peerId2}`);
      } finally {
        await Promise.all([
          kernel1 && stopWithTimeout(async () => kernel1!.stop(), STOP_TIMEOUT),
          kernel2 && stopWithTimeout(async () => kernel2!.stop(), STOP_TIMEOUT),
        ]);
      }
    },
    TEST_TIMEOUT,
  );
});
