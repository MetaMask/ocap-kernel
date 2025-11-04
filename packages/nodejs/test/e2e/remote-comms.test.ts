import '../../src/env/endoify.ts';

import type { CapData } from '@endo/marshal';
import type { Libp2p } from '@libp2p/interface';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Kernel, kunser, makeKernelStore } from '@metamask/ocap-kernel';
import type { ClusterConfig, KRef, VatId } from '@metamask/ocap-kernel';
import { startRelay } from '@ocap/cli/relay';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeTestKernel } from '../make-test-kernel.ts';

// Increase timeout for network operations
const NETWORK_TIMEOUT = 30_000;
// Test relay configuration
// The relay peer ID is deterministic based on RELAY_LOCAL_ID = 200 in relay.ts
const relayPeerId = '12D3KooWJBDqsyHQF2MWiCdU4kdqx4zTsSTLRdShg7Ui6CRWB4uc';
const testRelays = [`/ip4/127.0.0.1/tcp/9001/ws/p2p/${relayPeerId}`];

describe.sequential('Remote Communications E2E', () => {
  let relay: Libp2p;
  let kernel1: Kernel;
  let kernel2: Kernel;
  let kernelDatabase1: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelDatabase2: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelStore1: ReturnType<typeof makeKernelStore>;
  let kernelStore2: ReturnType<typeof makeKernelStore>;

  beforeEach(async () => {
    // Start the relay server
    relay = await startRelay(console);
    // Wait for relay to be fully initialized
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create two independent kernels with separate storage
    kernelDatabase1 = await makeSQLKernelDatabase({
      dbFilename: 'rc-e2e-test-kernel1.db',
    });
    kernelStore1 = makeKernelStore(kernelDatabase1);

    kernelDatabase2 = await makeSQLKernelDatabase({
      dbFilename: 'rc-e2e-test-kernel2.db',
    });
    kernelStore2 = makeKernelStore(kernelDatabase2);

    kernel1 = await makeTestKernel(kernelDatabase1, true);
    kernel2 = await makeTestKernel(kernelDatabase2, true);
  });

  afterEach(async () => {
    if (relay) {
      await relay.stop();
    }
    if (kernel1) {
      await kernel1.stop();
    }
    if (kernel2) {
      await kernel2.stop();
    }
    if (kernelDatabase1) {
      kernelDatabase1.close();
    }
    if (kernelDatabase2) {
      kernelDatabase2.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  describe.sequential('Basic Connectivity', () => {
    it(
      'initializes remote comms on both kernels',
      async () => {
        // Initialize remote comms on both kernels
        await kernel1.initRemoteComms(testRelays);
        await kernel2.initRemoteComms(testRelays);

        // Get status to verify remote comms is initialized
        const status1 = await kernel1.getStatus();
        const status2 = await kernel2.getStatus();

        expect(status1.remoteComms?.isInitialized).toBe(true);
        expect(status2.remoteComms?.isInitialized).toBe(true);

        // Verify peer IDs are different
        expect(status1.remoteComms?.peerId).toBeDefined();
        expect(status2.remoteComms?.peerId).toBeDefined();
        expect(status1.remoteComms?.peerId).not.toBe(
          status2.remoteComms?.peerId,
        );
      },
      NETWORK_TIMEOUT,
    );

    it(
      'sends messages between vats on different kernels',
      async () => {
        // Initialize remote comms on both kernels
        await kernel1.initRemoteComms(testRelays);
        await kernel2.initRemoteComms(testRelays);

        // Launch vats on both kernels
        const config1: ClusterConfig = {
          bootstrap: 'alice',
          services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
          vats: {
            alice: {
              bundleSpec: 'http://localhost:3000/remote-vat.bundle',
              parameters: { name: 'Alice' },
            },
          },
        };

        const config2: ClusterConfig = {
          bootstrap: 'bob',
          services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
          vats: {
            bob: {
              bundleSpec: 'http://localhost:3000/remote-vat.bundle',
              parameters: { name: 'Bob' },
            },
          },
        };

        // Launch subclusters and get ocap URLs
        const result1 = await kernel1.launchSubcluster(config1);
        const result2 = await kernel2.launchSubcluster(config2);

        // Get the ocap URLs from bootstrap results
        const aliceURL = kunser(result1 as CapData<KRef>) as string;
        const bobURL = kunser(result2 as CapData<KRef>) as string;
        console.log('aliceURL:', aliceURL);
        console.log('bobURL:', bobURL);

        expect(aliceURL).toMatch(/^ocap:/u);
        expect(bobURL).toMatch(/^ocap:/u);

        // Get Alice's root reference
        const vats1 = kernel1.getVats();
        const aliceVatId = vats1.find(
          (vat) => vat.config.parameters?.name === 'Alice',
        )?.id as VatId;
        const aliceRef = kernelStore1.getRootObject(aliceVatId) as KRef;
        console.log('aliceRef:', aliceRef);

        // Send a message from Alice to Bob using Bob's ocap URL
        const messageResult = await kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );

        const response = kunser(messageResult);
        expect(response).toContain('vat Bob got "hello" from Alice');
      },
      NETWORK_TIMEOUT,
    );

    it(
      'establishes bidirectional communication between kernels',
      async () => {
        // Initialize remote comms
        await kernel1.initRemoteComms(testRelays);
        await kernel2.initRemoteComms(testRelays);

        // Launch vats with ocap services
        const config1: ClusterConfig = {
          bootstrap: 'alice',
          services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
          vats: {
            alice: {
              bundleSpec: 'http://localhost:3000/remote-vat.bundle',
              parameters: { name: 'Alice' },
            },
          },
        };

        const config2: ClusterConfig = {
          bootstrap: 'bob',
          services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
          vats: {
            bob: {
              bundleSpec: 'http://localhost:3000/remote-vat.bundle',
              parameters: { name: 'Bob' },
            },
          },
        };

        const result1 = await kernel1.launchSubcluster(config1);
        const result2 = await kernel2.launchSubcluster(config2);

        const aliceURL = kunser(result1 as CapData<KRef>) as string;
        const bobURL = kunser(result2 as CapData<KRef>) as string;

        const vats1 = kernel1.getVats();
        const aliceVatId = vats1.find(
          (vat) => vat.config.parameters?.name === 'Alice',
        )?.id as VatId;
        const aliceRef = kernelStore1.getRootObject(aliceVatId) as KRef;

        const vats2 = kernel2.getVats();
        const bobVatId = vats2.find(
          (vat) => vat.config.parameters?.name === 'Bob',
        )?.id as VatId;
        const bobRef = kernelStore2.getRootObject(bobVatId) as KRef;

        // Alice sends to Bob
        const aliceToBob = await kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'hello', ['Alice']],
        );
        expect(kunser(aliceToBob)).toContain('vat Bob got "hello" from Alice');

        // Bob sends to Alice
        const bobToAlice = await kernel2.queueMessage(
          bobRef,
          'sendRemoteMessage',
          [aliceURL, 'hello', ['Bob']],
        );
        expect(kunser(bobToAlice)).toContain('vat Alice got "hello" from Bob');
      },
      NETWORK_TIMEOUT,
    );
  });
});
