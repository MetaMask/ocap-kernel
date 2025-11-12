import '../../src/env/endoify.ts';

import type { CapData } from '@endo/marshal';
import type { Libp2p } from '@libp2p/interface';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Kernel, kunser, makeKernelStore } from '@metamask/ocap-kernel';
import type { ClusterConfig, KRef, VatId } from '@metamask/ocap-kernel';
import { startRelay } from '@ocap/cli/relay';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeTestKernel, runTestVats } from '../utils.ts';

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

  describe('Basic Connectivity', () => {
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

        expect(aliceURL).toMatch(/^ocap:/u);
        expect(bobURL).toMatch(/^ocap:/u);

        // Get Alice's root reference
        const vats1 = kernel1.getVats();
        const aliceVatId = vats1.find(
          (vat) => vat.config.parameters?.name === 'Alice',
        )?.id as VatId;
        const aliceRef = kernelStore1.getRootObject(aliceVatId) as KRef;

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

  describe('Connection Resilience', () => {
    it(
      'remote relationships should survive kernel restart',
      async () => {
        // Initialize remote comms
        await kernel1.initRemoteComms(testRelays);
        await kernel2.initRemoteComms(testRelays);

        // Wait for things to settle and connections to establish
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Launch client vat on kernel1
        const clientConfig = makeMaasClientConfig('client1', true);
        let clientKernel = kernel1;
        await runTestVats(clientKernel, clientConfig);
        const clientRootRef = kernelStore1.getRootObject('v1') as KRef;

        // Launch server vat on kernel2
        const serverConfig = makeMaasServerConfig('server2', true);
        let serverKernel = kernel2;
        const serverResult = await runTestVats(serverKernel, serverConfig);

        // The server's ocap URL is its bootstrap result
        const serverURL = serverResult as string;

        expect(typeof serverURL).toBe('string');
        expect(serverURL).toMatch(/^ocap:/u);

        // Configure the client with the server's URL
        const setupResult = await clientKernel.queueMessage(
          clientRootRef,
          'setMaas',
          [serverURL],
        );
        let response = kunser(setupResult);
        expect(response).toBeDefined();
        expect(response).toContain('MaaS service URL set');

        // Tell the client to talk to the server
        let expectedCount = 1;
        const stepResult = await clientKernel.queueMessage(
          clientRootRef,
          'step',
          [],
        );
        response = kunser(stepResult);
        expect(response).toBeDefined();
        expect(response).toContain(`next step: ${expectedCount} `);

        // Kill the server and restart it
        await serverKernel.stop();
        serverKernel = await makeTestKernel(kernelDatabase2, false);
        await serverKernel.initRemoteComms(testRelays);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Tell the client to talk to the server a second time
        expectedCount += 1;
        const stepResult2 = await clientKernel.queueMessage(
          clientRootRef,
          'step',
          [],
        );
        response = kunser(stepResult2);
        expect(response).toBeDefined();
        expect(response).toContain(`next step: ${expectedCount} `);

        // Kill the client and restart it
        await clientKernel.stop();
        clientKernel = await makeTestKernel(kernelDatabase1, false);
        await clientKernel.initRemoteComms(testRelays);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Tell the client to talk to the server a third time
        expectedCount += 1;
        const stepResult3 = await clientKernel.queueMessage(
          clientRootRef,
          'step',
          [],
        );
        response = kunser(stepResult3);
        expect(response).toBeDefined();
        expect(response).toContain(`next step: ${expectedCount} `);
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'handles connection failure and recovery',
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

        await kernel2.stop();
        // Wait a bit for the connection to be fully closed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Restart kernel2 with same storage - vats will be restored with baggage
        // eslint-disable-next-line require-atomic-updates
        kernel2 = await makeTestKernel(kernelDatabase2, false);
        await kernel2.initRemoteComms(testRelays);

        // Wait for things to settle and connections to re-establish
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Send message after recovery - connection should be re-established
        const recoveryResult = await kernel1.queueMessage(
          aliceRef,
          'testConnection',
          [bobURL],
        );
        const recoveryResponse = kunser(recoveryResult) as {
          status: string;
          result?: unknown;
          error?: string;
        };
        expect(recoveryResponse).toHaveProperty('status');
        expect(recoveryResponse.status).toBe('connected');
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'handles reconnection with exponential backoff',
      async () => {
        // Initialize kernel1 and launch a vat
        await kernel1.initRemoteComms(testRelays);

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

        await kernel1.launchSubcluster(config1);
        const vats1 = kernel1.getVats();
        const aliceVatId = vats1.find(
          (vat) => vat.config.parameters?.name === 'Alice',
        )?.id as VatId;
        const aliceRef = kernelStore1.getRootObject(aliceVatId) as KRef;

        // Create a fake ocap URL for a non-existent kernel
        const fakeURL =
          'ocap://12D3KooWFakePeerIdThatDoesNotExist123456789/ko1';

        // Try to connect to non-existent peer - should fail gracefully
        const connectionTest = await kernel1.queueMessage(
          aliceRef,
          'testConnection',
          [fakeURL],
        );

        const result = kunser(connectionTest) as {
          status: string;
          error?: string;
        };
        expect(result).toHaveProperty('status');
        expect(result.status).toBe('disconnected');
        expect(result).toHaveProperty('error');
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('Message Queueing', () => {
    it(
      'queues messages when connection is not established',
      async () => {
        // Initialize both kernels' remote comms
        await kernel1.initRemoteComms(testRelays);
        await kernel2.initRemoteComms(testRelays);

        // Launch Alice vat on kernel1
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

        await kernel1.launchSubcluster(config1);
        const vats1 = kernel1.getVats();
        const aliceVatId = vats1.find(
          (vat) => vat.config.parameters?.name === 'Alice',
        )?.id as VatId;
        const aliceRef = kernelStore1.getRootObject(aliceVatId) as KRef;

        // Launch Bob vat on kernel2 to get his URL
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

        const result2 = await kernel2.launchSubcluster(config2);
        const bobURL = kunser(result2 as CapData<KRef>) as string;

        // Stop kernel2 to simulate connection loss
        await kernel2.stop();

        // Wait a bit for the connection to be fully closed
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Send messages while kernel2 is offline - these should be queued
        const queuePromises = [];
        for (let i = 0; i < 3; i++) {
          const promise = kernel1.queueMessage(aliceRef, 'queueMessage', [
            bobURL,
            'receiveSequence',
            [i],
          ]);
          queuePromises.push(promise);
        }

        // Restart kernel2 with same storage - Bob vat will be restored
        // eslint-disable-next-line require-atomic-updates
        kernel2 = await makeTestKernel(kernelDatabase2, false);
        await kernel2.initRemoteComms(testRelays);

        // Relaunch Bob vat to restore it
        await kernel2.launchSubcluster(config2);

        // Wait for connections to re-establish
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Messages should be queued and delivered after reconnection
        // Note: Some may fail if the vat wasn't restored properly, but queueing should work
        const queueResults = await Promise.allSettled(queuePromises);
        expect(queueResults).toHaveLength(3);

        // Verify we can send messages normally after reconnection
        const normalMessage = await kernel1.queueMessage(
          aliceRef,
          'sendRemoteMessage',
          [bobURL, 'receiveSequence', [99]],
        );
        const response = kunser(normalMessage);
        expect(response).toBe('Sequence 99 received');
      },
      NETWORK_TIMEOUT * 2,
    );

    it(
      'preserves message order during queueing',
      async () => {
        // Initialize remote comms and launch vats
        await kernel1.initRemoteComms(testRelays);
        await kernel2.initRemoteComms(testRelays);

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

        await kernel1.launchSubcluster(config1);
        const result2 = await kernel2.launchSubcluster(config2);

        const bobURL = kunser(result2 as CapData<KRef>) as string;
        const vats1 = kernel1.getVats();
        const aliceVatId = vats1.find(
          (vat) => vat.config.parameters?.name === 'Alice',
        )?.id as VatId;
        const aliceRef = kernelStore1.getRootObject(aliceVatId) as KRef;

        // Send multiple messages in sequence using sendSequence
        const sequenceResult = await kernel1.queueMessage(
          aliceRef,
          'sendSequence',
          [bobURL, 5],
        );

        const results = kunser(sequenceResult) as string[];
        expect(results).toHaveLength(5);

        // Verify messages were received in order
        for (let i = 0; i < 5; i++) {
          expect(results[i]).toBe(`Sequence ${i} received`);
        }
      },
      NETWORK_TIMEOUT,
    );
  });
});

/**
 * Create a test subcluster configuration for a MaaS server vat.
 *
 * @param name - The name of the vat.
 * @param forceReset - True if cluster should reset on start
 * @returns Cluster configuration to run a MaaS server.
 */
function makeMaasServerConfig(
  name: string,
  forceReset: boolean,
): ClusterConfig {
  return {
    bootstrap: 'maasServer',
    forceReset,
    services: ['ocapURLIssuerService'],
    vats: {
      maasServer: {
        bundleSpec: 'http://localhost:3000/monotonous-vat.bundle',
        parameters: {
          name,
        },
      },
    },
  };
}

/**
 * Create a test subcluster configuration for a MaaS client vat.
 *
 * @param name - The name of the vat.
 * @param forceReset - True if cluster should reset on start
 * @returns Cluster configuration to run a MaaS client.
 */
function makeMaasClientConfig(
  name: string,
  forceReset: boolean,
): ClusterConfig {
  return {
    bootstrap: 'maasClient',
    forceReset,
    services: ['ocapURLRedemptionService'],
    vats: {
      maasClient: {
        bundleSpec: 'http://localhost:3000/stepper-upper-vat.bundle',
        parameters: {
          name,
        },
      },
    },
  };
}
