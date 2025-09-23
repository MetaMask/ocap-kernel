import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent, fromHex } from '@metamask/kernel-utils';
import { makeKernelStore, kunser, Kernel } from '@metamask/ocap-kernel';
import type {
  KernelStore,
  ClusterConfig,
  KRef,
  PlatformServices,
  RemoteMessageHandler,
} from '@metamask/ocap-kernel';
import { NodejsPlatformServices } from '@ocap/nodejs';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  makeTestLogger,
  getBundleSpec,
  runTestVats,
  makeKernel,
} from './utils.ts';

/**
 * Create a direct network platform services that bypasses libp2p for local testing.
 * This creates a simple in-memory message router between kernels.
 */
class DirectNetworkService {
  peerRegistry = new Map<string, RemoteMessageHandler>();

  peerAddresses = new Map<string, string>();

  /**
   * Register a peer with its handler and address.
   *
   * @param peerId - The peer ID to register.
   * @param handler - The handler to register.
   * @param address - The address to register.
   */
  registerPeer(
    peerId: string,
    handler: RemoteMessageHandler,
    address: string,
  ): void {
    this.peerRegistry.set(peerId, handler);
    this.peerAddresses.set(peerId, address);
  }

  /**
   * Create platform services that route messages directly between registered peers.
   *
   * @param tempPeerId - The temporary peer ID used during initialization.
   * @returns The platform services.
   */
  createPlatformServices(tempPeerId: string): PlatformServices {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    // Store the actual peer ID once we know it
    let actualPeerId: string | undefined;

    return {
      async launch(vatId) {
        const realServices = new NodejsPlatformServices({
          logger: makeTestLogger().logger,
        });
        return realServices.launch(vatId);
      },

      async terminate() {
        // Mock implementation
        return Promise.resolve();
      },

      async terminateAll() {
        // Mock implementation
        return Promise.resolve();
      },

      async sendRemoteMessage(to: string, message: string) {
        const fromPeer = actualPeerId ?? tempPeerId;
        // Route message directly to the target peer's handler
        const targetHandler = self.peerRegistry.get(to);
        if (targetHandler) {
          const response = await targetHandler(fromPeer, message);
          // If there's a response, send it back
          if (response) {
            const senderHandler = self.peerRegistry.get(fromPeer);
            if (senderHandler) {
              await senderHandler(to, response);
            }
          }
        } else {
          throw new Error(`No handler registered for peer ${to}`);
        }
      },

      async initializeRemoteComms(
        keySeed: string,
        _knownRelays: string[],
        handler: RemoteMessageHandler,
      ) {
        // Generate the actual peer ID from the key seed
        const keyPair = await generateKeyPairFromSeed(
          'Ed25519',
          fromHex(keySeed),
        );
        actualPeerId = peerIdFromPrivateKey(keyPair).toString();

        // Register this peer in the direct network with its actual ID
        self.registerPeer(actualPeerId, handler, 'direct://localhost');
        console.log(`Registered peer ${actualPeerId} for direct messaging`);
        return Promise.resolve();
      },
    };
  }
}

// Type definitions for test result objects
type BootstrapResult = {
  message: string;
  ocapURL: string;
};

/**
 * Create a test subcluster configuration for remote sender vat.
 *
 * @param name - The name of the sender vat.
 * @returns Cluster configuration for the sender.
 */
function makeReceiverSubclusterConfigConfig(name: string): ClusterConfig {
  return {
    bootstrap: 'sender',
    forceReset: true,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      sender: {
        bundleSpec: getBundleSpec('remote-sender-vat'),
        parameters: {
          name,
        },
      },
      receiver: {
        bundleSpec: getBundleSpec('remote-receiver-vat'),
        parameters: {
          name: `${name}LocalReceiver`,
        },
      },
    },
  };
}

/**
 * Create a test subcluster configuration for remote receiver vat.
 *
 * @param name - The name of the receiver vat.
 * @returns Cluster configuration for the receiver.
 */
function makeReceiverSubclusterConfig(name: string): ClusterConfig {
  return {
    bootstrap: 'receiver',
    forceReset: true,
    services: ['ocapURLIssuerService', 'ocapURLRedemptionService'],
    vats: {
      receiver: {
        bundleSpec: getBundleSpec('remote-receiver-vat'),
        parameters: {
          name,
        },
      },
    },
  };
}

describe('Remote Communications (Integration Tests)', () => {
  let kernel1: Kernel;
  let kernel2: Kernel;
  let kernelStore1: KernelStore;
  let directNetwork: DirectNetworkService;

  beforeEach(async () => {
    // Create direct network service for deterministic testing
    directNetwork = new DirectNetworkService();

    // Create two independent kernels with separate in-memory databases
    const kernelDatabase1 = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    kernelStore1 = makeKernelStore(kernelDatabase1);
    const kernelDatabase2 = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });

    const logger1 = makeTestLogger().logger;
    const logger2 = makeTestLogger().logger;

    // Create mock platform services for direct communication
    const platformServices1 =
      directNetwork.createPlatformServices('kernel1-peer');
    const platformServices2 =
      directNetwork.createPlatformServices('kernel2-peer');

    kernel1 = await makeKernel(
      kernelDatabase1,
      true,
      logger1,
      undefined,
      platformServices1,
    );

    kernel2 = await makeKernel(
      kernelDatabase2,
      true,
      logger2,
      undefined,
      platformServices2,
    );

    await kernel1.initRemoteComms();
    await kernel2.initRemoteComms();
  });

  it('should initialize remote communications without errors', async () => {
    const status1 = await kernel1.getStatus();
    const status2 = await kernel2.getStatus();
    expect(status1).toBeDefined();
    expect(status2).toBeDefined();
    expect(status1.vats).toStrictEqual([]);
    expect(status2.vats).toStrictEqual([]);
    expect(status1.remoteComms).toBeDefined();
    expect(status2.remoteComms).toBeDefined();
    expect(status1.remoteComms?.isInitialized).toBe(true);
    expect(status2.remoteComms?.isInitialized).toBe(true);
    expect(status1.remoteComms?.peerId).toBeDefined();
    expect(status2.remoteComms?.peerId).toBeDefined();
    expect(status1.remoteComms?.peerId).not.toBe(status2.remoteComms?.peerId);
  });

  it('should create vats with ocap URL services', async () => {
    // Launch sender vat on kernel1
    const senderConfig = makeReceiverSubclusterConfigConfig('Sender1');
    const senderResult = await runTestVats(kernel1, senderConfig);

    expect(senderResult).toBeDefined();
    expect(senderResult).toHaveProperty('message');
    expect(senderResult).toHaveProperty('ocapURL');

    // Launch receiver vat on kernel2
    const receiverConfig = makeReceiverSubclusterConfig('Receiver2');
    const receiverResult = await runTestVats(kernel2, receiverConfig);

    expect(receiverResult).toBeDefined();
    expect(receiverResult).toHaveProperty('message');
    expect(receiverResult).toHaveProperty('ocapURL');

    // Verify both have issued ocap URLs
    const senderBootstrap = senderResult as BootstrapResult;
    const receiverBootstrap = receiverResult as BootstrapResult;
    expect(typeof senderBootstrap.ocapURL).toBe('string');
    expect(typeof receiverBootstrap.ocapURL).toBe('string');
    expect(senderBootstrap.ocapURL).toMatch(/^ocap:/u);
    expect(receiverBootstrap.ocapURL).toMatch(/^ocap:/u);
  });

  it('should send remote message between kernels via ocap URLs', async () => {
    // Launch sender vat on kernel1
    const senderConfig = makeReceiverSubclusterConfigConfig('Sender1');
    await runTestVats(kernel1, senderConfig);
    const senderRootRef = kernelStore1.getRootObject('v1') as KRef;

    // Launch receiver vat on kernel2
    const receiverConfig = makeReceiverSubclusterConfig('Receiver2');
    const receiverResult = await runTestVats(kernel2, receiverConfig);

    // Get the receiver's ocap URL from bootstrap result
    const receiverBootstrap = receiverResult as BootstrapResult;
    const receiverURL = receiverBootstrap.ocapURL;

    expect(typeof receiverURL).toBe('string');
    expect(receiverURL).toMatch(/^ocap:/u);

    // Send a remote message from kernel1 to kernel2 using the ocap URL
    const remoteCallResult = await kernel1.queueMessage(
      senderRootRef,
      'sendMessage',
      [receiverURL, 'hello', ['RemoteSender from Kernel1']],
    );

    // Wait for both kernels to process their messages
    // The message flow is: kernel1 -> kernel2 -> kernel1
    await waitUntilQuiescent(100);

    const response = kunser(remoteCallResult);
    expect(response).toBeDefined();
    expect(response).toContain('says hello back to');
  });
});
