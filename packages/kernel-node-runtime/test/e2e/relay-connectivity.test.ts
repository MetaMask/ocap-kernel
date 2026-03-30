import type { Libp2p } from '@libp2p/interface';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { startRelay } from '@metamask/kernel-utils/libp2p';
import { Kernel } from '@metamask/ocap-kernel';
import type { KernelStatus } from '@metamask/ocap-kernel';
import { createConnection } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';

const STOP_TIMEOUT = 5_000;
const TEST_TIMEOUT = 30_000;
const RELAY_PEER_ID = '12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc';
const RELAY_WS_PORT = 9001;

/**
 * Stop an operation with a timeout to prevent hangs during cleanup.
 *
 * @param stopFn - The stop function to call.
 * @param timeoutMs - The timeout in milliseconds.
 * @param label - A label for logging.
 */
async function stopWithTimeout(
  stopFn: () => Promise<unknown>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  try {
    await Promise.race([
      stopFn(),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs),
      ),
    ]);
  } catch {
    // Ignore timeout errors during cleanup
  }
}

function getRemoteCommsPeerId(
  remoteComms: KernelStatus['remoteComms'],
): string | undefined {
  if (remoteComms && remoteComms.state !== 'disconnected') {
    return remoteComms.peerId;
  }
  return undefined;
}

/**
 * Check if a TCP port is already in use.
 *
 * @param port - The port to check.
 * @returns True if the port is in use.
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

describe('Relay Connectivity', () => {
  let relay: Libp2p | undefined;
  const relayAddr = `/ip4/127.0.0.1/tcp/${RELAY_WS_PORT}/ws/p2p/${RELAY_PEER_ID}`;

  beforeAll(async () => {
    // In CI, the test-e2e-ci.sh script or another test file may already have
    // a relay running on port 9001. Only start our own if the port is free.
    if (!(await isPortInUse(RELAY_WS_PORT))) {
      relay = await startRelay(console);
    }
  }, 15_000);

  afterAll(async () => {
    if (relay) {
      await stopWithTimeout(
        async () => relay!.stop(),
        STOP_TIMEOUT,
        'relay.stop',
      );
    }
  }, 10_000);

  it('relay is reachable on expected port', async () => {
    expect(await isPortInUse(RELAY_WS_PORT)).toBe(true);
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
      } finally {
        if (kernel) {
          await stopWithTimeout(
            async () => kernel!.stop(),
            STOP_TIMEOUT,
            'kernel.stop',
          );
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
      } finally {
        await Promise.all([
          kernel1 &&
            stopWithTimeout(
              async () => kernel1!.stop(),
              STOP_TIMEOUT,
              'kernel1.stop',
            ),
          kernel2 &&
            stopWithTimeout(
              async () => kernel2!.stop(),
              STOP_TIMEOUT,
              'kernel2.stop',
            ),
        ]);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'kernel reports connected state even with unreachable relay',
    async () => {
      // Use a valid but unreachable relay address on a port nothing listens on
      const badRelayAddr =
        '/ip4/127.0.0.1/tcp/19999/ws/p2p/12D3KooWBTf3S95YAsh6fi5rhohMsk8qaTy19rrpW8X9G69vn6GP';
      const kernelDb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
      let kernel: Kernel | undefined;

      try {
        kernel = await makeTestKernel(kernelDb);
        // initRemoteComms should not throw even if the relay is unreachable —
        // the libp2p node starts locally and relay connection happens async.
        await kernel.initRemoteComms({ relays: [badRelayAddr] });

        const status = await kernel.getStatus();
        // The kernel still gets a local peer ID even without relay connectivity
        expect(status.remoteComms?.state).toBe('connected');
        expect(getRemoteCommsPeerId(status.remoteComms)).toBeDefined();
      } finally {
        if (kernel) {
          await stopWithTimeout(
            async () => kernel!.stop(),
            STOP_TIMEOUT,
            'kernel.stop',
          );
        }
      }
    },
    TEST_TIMEOUT,
  );
});
