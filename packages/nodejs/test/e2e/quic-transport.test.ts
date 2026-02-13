import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Kernel, makeKernelStore } from '@metamask/ocap-kernel';
import { delay } from '@ocap/repo-tools/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeTestKernel } from '../helpers/kernel.ts';
import {
  getVatRootRef,
  launchVatAndGetURL,
  makeRemoteVatConfig,
  sendRemoteMessage,
} from '../helpers/remote-comms.ts';

// Increase timeout for network operations
const NETWORK_TIMEOUT = 30_000;

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

// Listen addresses for each kernel (port 0 = OS-assigned)
const quicListenAddress = '/ip4/127.0.0.1/udp/0/quic-v1';
const tcpListenAddress = '/ip4/127.0.0.1/tcp/0';

/**
 * Get the connected remote comms info from a kernel's status.
 *
 * @param kernel - The kernel to get info from.
 * @returns The peer ID and listen addresses.
 */
async function getConnectedInfo(kernel: Kernel): Promise<{
  peerId: string;
  listenAddresses: string[];
  quicAddresses: string[];
  tcpAddresses: string[];
}> {
  const status = await kernel.getStatus();
  if (status.remoteComms?.state !== 'connected') {
    throw new Error('Remote comms not connected');
  }
  const { peerId, listenAddresses } = status.remoteComms;
  return {
    peerId,
    listenAddresses,
    quicAddresses: listenAddresses.filter((addr) => addr.includes('/quic-v1/')),
    tcpAddresses: listenAddresses.filter(
      (addr) => addr.includes('/tcp/') && !addr.includes('/ws'),
    ),
  };
}

describe.sequential('Direct Transport E2E', () => {
  let kernel1: Kernel;
  let kernel2: Kernel;
  let kernelDatabase1: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelDatabase2: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelStore1: ReturnType<typeof makeKernelStore>;
  let kernelStore2: ReturnType<typeof makeKernelStore>;

  beforeEach(async () => {
    kernelDatabase1 = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    kernelStore1 = makeKernelStore(kernelDatabase1);

    kernelDatabase2 = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    kernelStore2 = makeKernelStore(kernelDatabase2);

    kernel1 = await makeTestKernel(kernelDatabase1);
    kernel2 = await makeTestKernel(kernelDatabase2);
  });

  afterEach(async () => {
    const STOP_TIMEOUT = 3000;
    await Promise.all([
      kernel1 &&
        stopWithTimeout(
          async () => kernel1.stop(),
          STOP_TIMEOUT,
          'kernel1.stop',
        ),
      kernel2 &&
        stopWithTimeout(
          async () => kernel2.stop(),
          STOP_TIMEOUT,
          'kernel2.stop',
        ),
    ]);
    if (kernelDatabase1) {
      kernelDatabase1.close();
    }
    if (kernelDatabase2) {
      kernelDatabase2.close();
    }
    await delay(200);
  });

  describe('Initialization', () => {
    it(
      'initializes remote comms with QUIC transport without a relay',
      async () => {
        await kernel1.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });
        await kernel2.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });

        const info1 = await getConnectedInfo(kernel1);
        const info2 = await getConnectedInfo(kernel2);

        // Each kernel should have QUIC listen addresses
        expect(info1.quicAddresses.length).toBeGreaterThan(0);
        expect(info2.quicAddresses.length).toBeGreaterThan(0);

        // Peer IDs should be distinct
        expect(info1.peerId).not.toBe(info2.peerId);
      },
      NETWORK_TIMEOUT,
    );

    it(
      'initializes remote comms with TCP transport without a relay',
      async () => {
        await kernel1.initRemoteComms({
          directListenAddresses: [tcpListenAddress],
        });
        await kernel2.initRemoteComms({
          directListenAddresses: [tcpListenAddress],
        });

        const info1 = await getConnectedInfo(kernel1);
        const info2 = await getConnectedInfo(kernel2);

        // Each kernel should have TCP listen addresses
        expect(info1.tcpAddresses.length).toBeGreaterThan(0);
        expect(info2.tcpAddresses.length).toBeGreaterThan(0);

        // Peer IDs should be distinct
        expect(info1.peerId).not.toBe(info2.peerId);
      },
      NETWORK_TIMEOUT,
    );

    it(
      'initializes remote comms with both QUIC and TCP',
      async () => {
        await kernel1.initRemoteComms({
          directListenAddresses: [quicListenAddress, tcpListenAddress],
        });

        const info1 = await getConnectedInfo(kernel1);

        expect(info1.quicAddresses.length).toBeGreaterThan(0);
        expect(info1.tcpAddresses.length).toBeGreaterThan(0);
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('Direct Connectivity', () => {
    it(
      'sends a message via direct QUIC',
      async () => {
        // Initialize both kernels with QUIC only — no relays
        await kernel1.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });
        await kernel2.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });

        // Get kernel2's QUIC addresses and register them on kernel1
        const info2 = await getConnectedInfo(kernel2);
        await kernel1.registerLocationHints(info2.peerId, info2.quicAddresses);

        // Launch vats
        const aliceConfig = makeRemoteVatConfig('Alice');
        const bobConfig = makeRemoteVatConfig('Bob');
        await launchVatAndGetURL(kernel1, aliceConfig);
        const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

        const response = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(response).toContain('vat Bob got "hello" from Alice');
      },
      NETWORK_TIMEOUT,
    );

    it(
      'establishes bidirectional QUIC communication',
      async () => {
        await kernel1.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });
        await kernel2.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });

        // Exchange QUIC addresses
        const info1 = await getConnectedInfo(kernel1);
        const info2 = await getConnectedInfo(kernel2);

        await kernel1.registerLocationHints(info2.peerId, info2.quicAddresses);
        await kernel2.registerLocationHints(info1.peerId, info1.quicAddresses);

        // Launch vats
        const aliceConfig = makeRemoteVatConfig('Alice');
        const bobConfig = makeRemoteVatConfig('Bob');
        const aliceURL = await launchVatAndGetURL(kernel1, aliceConfig);
        const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');
        const bobRef = getVatRootRef(kernel2, kernelStore2, 'Bob');

        // Alice → Bob
        const aliceToBob = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(aliceToBob).toContain('vat Bob got "hello" from Alice');

        // Bob → Alice
        const bobToAlice = await sendRemoteMessage(
          kernel2,
          bobRef,
          aliceURL,
          'hello',
          ['Bob'],
        );
        expect(bobToAlice).toContain('vat Alice got "hello" from Bob');
      },
      NETWORK_TIMEOUT,
    );

    it(
      'sends multiple sequential messages via QUIC',
      async () => {
        await kernel1.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });
        await kernel2.initRemoteComms({
          directListenAddresses: [quicListenAddress],
        });

        const info2 = await getConnectedInfo(kernel2);
        await kernel1.registerLocationHints(info2.peerId, info2.quicAddresses);

        const aliceConfig = makeRemoteVatConfig('Alice');
        const bobConfig = makeRemoteVatConfig('Bob');
        await launchVatAndGetURL(kernel1, aliceConfig);
        const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

        for (let i = 0; i < 5; i++) {
          const response = await sendRemoteMessage(
            kernel1,
            aliceRef,
            bobURL,
            'hello',
            ['Alice'],
          );
          expect(response).toContain('vat Bob got "hello" from Alice');
        }
      },
      NETWORK_TIMEOUT,
    );

    it(
      'sends a message via direct TCP',
      async () => {
        await kernel1.initRemoteComms({
          directListenAddresses: [tcpListenAddress],
        });
        await kernel2.initRemoteComms({
          directListenAddresses: [tcpListenAddress],
        });

        const info2 = await getConnectedInfo(kernel2);
        await kernel1.registerLocationHints(info2.peerId, info2.tcpAddresses);

        const aliceConfig = makeRemoteVatConfig('Alice');
        const bobConfig = makeRemoteVatConfig('Bob');
        await launchVatAndGetURL(kernel1, aliceConfig);
        const bobURL = await launchVatAndGetURL(kernel2, bobConfig);

        const aliceRef = getVatRootRef(kernel1, kernelStore1, 'Alice');

        const response = await sendRemoteMessage(
          kernel1,
          aliceRef,
          bobURL,
          'hello',
          ['Alice'],
        );
        expect(response).toContain('vat Bob got "hello" from Alice');
      },
      NETWORK_TIMEOUT,
    );
  });
});
