import { NodejsPlatformServices } from '@metamask/kernel-node-runtime';
import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { KRef } from '@metamask/ocap-kernel';
import { delay } from '@ocap/repo-tools/test-utils';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeWalletClusterConfig } from '../../src/cluster-config.ts';
import type { Address, Hex, TransactionRequest } from '../../src/types.ts';

const NETWORK_TIMEOUT = 30_000;
const QUIC_LISTEN_ADDRESS = '/ip4/127.0.0.1/udp/0/quic-v1';
const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const BUNDLE_BASE_URL = new URL('../../src/vats', import.meta.url).toString();

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
  };
}

/**
 * Create a test kernel with an in-memory database.
 *
 * @param kernelDatabase - The kernel database to use.
 * @returns The kernel instance.
 */
async function makeTestKernel(kernelDatabase: KernelDatabase): Promise<Kernel> {
  const platformServices = new NodejsPlatformServices({});
  return Kernel.make(platformServices, kernelDatabase, {
    resetStorage: true,
  });
}

/**
 * Call a method on a vat root object and deserialize the result.
 *
 * @param kernel - The kernel to send the message to.
 * @param target - The KRef of the target object.
 * @param method - The method name to call.
 * @param args - The arguments to pass.
 * @returns The deserialized result.
 */
async function callVatMethod(
  kernel: Kernel,
  target: KRef,
  method: string,
  args: unknown[] = [],
): Promise<unknown> {
  const result = await kernel.queueMessage(target, method, args);
  await waitUntilQuiescent();
  return kunser(result);
}

describe.sequential('Peer wallet integration', () => {
  let kernel1: Kernel;
  let kernel2: Kernel;
  let kernelDb1: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernelDb2: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let coordinatorKref1: KRef;
  let coordinatorKref2: KRef;

  beforeEach(async () => {
    // Create in-memory databases
    kernelDb1 = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    kernelDb2 = await makeSQLKernelDatabase({ dbFilename: ':memory:' });

    // Create kernels
    kernel1 = await makeTestKernel(kernelDb1);
    kernel2 = await makeTestKernel(kernelDb2);

    // Initialize QUIC on both
    await kernel1.initRemoteComms({
      directListenAddresses: [QUIC_LISTEN_ADDRESS],
    });
    await kernel2.initRemoteComms({
      directListenAddresses: [QUIC_LISTEN_ADDRESS],
    });

    // Exchange location hints for direct connectivity
    const info1 = await getConnectedInfo(kernel1);
    const info2 = await getConnectedInfo(kernel2);
    await kernel1.registerLocationHints(info2.peerId, info2.quicAddresses);
    await kernel2.registerLocationHints(info1.peerId, info1.quicAddresses);

    // Launch wallet subclusters on each kernel
    const homeConfig = makeWalletClusterConfig({
      bundleBaseUrl: BUNDLE_BASE_URL,
      role: 'home',
    });
    const awayConfig = makeWalletClusterConfig({
      bundleBaseUrl: BUNDLE_BASE_URL,
      role: 'away',
    });

    const result1 = await kernel1.launchSubcluster(homeConfig);
    await waitUntilQuiescent();
    coordinatorKref1 = result1.rootKref;

    const result2 = await kernel2.launchSubcluster(awayConfig);
    await waitUntilQuiescent();
    coordinatorKref2 = result2.rootKref;
  }, NETWORK_TIMEOUT);

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
    kernelDb1?.close();
    kernelDb2?.close();
    await delay(200);
  });

  describe('peer connection establishment', () => {
    it(
      'connects two wallet subclusters via OCAP URL',
      async () => {
        // Initialize keyring on kernel1 (the "owner" wallet)
        await callVatMethod(kernel1, coordinatorKref1, 'initializeKeyring', [
          { type: 'srp', mnemonic: TEST_MNEMONIC },
        ]);

        // Kernel1 issues an OCAP URL for its coordinator
        const ocapUrl = (await callVatMethod(
          kernel1,
          coordinatorKref1,
          'issueOcapUrl',
        )) as string;
        expect(ocapUrl).toMatch(/^ocap:/u);

        // Kernel2 connects to kernel1 via that URL
        await callVatMethod(kernel2, coordinatorKref2, 'connectToPeer', [
          ocapUrl,
        ]);

        // Verify kernel2 now has a peer wallet reference
        const caps = (await callVatMethod(
          kernel2,
          coordinatorKref2,
          'getCapabilities',
        )) as {
          hasLocalKeys: boolean;
          hasPeerWallet: boolean;
        };
        expect(caps.hasPeerWallet).toBe(true);
        expect(caps.hasLocalKeys).toBe(false);
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('remote signing via peer wallet', () => {
    it(
      'signs messages with local keys on away coordinator',
      async () => {
        // Initialize keyring on kernel2 (away) so it has local signing authority
        await callVatMethod(kernel2, coordinatorKref2, 'initializeKeyring', [
          { type: 'srp', mnemonic: TEST_MNEMONIC },
        ]);

        const signature = (await callVatMethod(
          kernel2,
          coordinatorKref2,
          'signMessage',
          ['Hello from kernel2'],
        )) as Hex;

        expect(signature).toMatch(/^0x/u);
        expect(signature).toHaveLength(132);
      },
      NETWORK_TIMEOUT,
    );

    it(
      'rejects transaction signing when away coordinator has no local keys',
      async () => {
        // kernel2 (away) has no local keys — signTransaction should reject.
        const tx: TransactionRequest = {
          from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address,
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
          value: '0xde0b6b3a7640000' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        };

        await expect(
          kernel2.queueMessage(coordinatorKref2, 'signTransaction', [tx]),
        ).rejects.toThrow('No authority to sign this transaction');
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('no authority', () => {
    it(
      'returns error when no local keys and no peer wallet',
      async () => {
        // Kernel2 has no keys and no peer wallet connected
        await expect(
          kernel2.queueMessage(coordinatorKref2, 'signMessage', [
            'should fail',
          ]),
        ).rejects.toThrow('No authority to sign message');
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('capabilities reporting', () => {
    it(
      'reports correct capabilities for each kernel',
      async () => {
        // Initialize keyring on kernel1 only
        await callVatMethod(kernel1, coordinatorKref1, 'initializeKeyring', [
          { type: 'srp', mnemonic: TEST_MNEMONIC },
        ]);

        const caps1 = (await callVatMethod(
          kernel1,
          coordinatorKref1,
          'getCapabilities',
        )) as {
          hasLocalKeys: boolean;
          localAccounts: Address[];
          delegationCount: number;
          hasPeerWallet: boolean;
        };

        expect(caps1).toStrictEqual({
          hasLocalKeys: true,
          localAccounts: expect.arrayContaining([
            expect.stringMatching(/^0x[\da-f]{40}$/iu),
          ]),
          delegationCount: 0,
          delegations: undefined,
          hasPeerWallet: false,
          hasExternalSigner: false,
          hasBundlerConfig: false,
          smartAccountAddress: undefined,
          chainId: undefined,
          signingMode: 'local',
          autonomy: 'EOA signing',
          peerAccountsCached: false,
          cachedPeerAccounts: [],
          hasAwayWallet: false,
        });

        const caps2 = (await callVatMethod(
          kernel2,
          coordinatorKref2,
          'getCapabilities',
        )) as {
          hasLocalKeys: boolean;
          localAccounts: Address[];
          delegationCount: number;
          hasPeerWallet: boolean;
        };

        expect(caps2).toStrictEqual({
          hasLocalKeys: false,
          localAccounts: [],
          delegationCount: 0,
          hasPeerWallet: false,
          hasExternalSigner: false,
          hasBundlerConfig: false,
          smartAccountAddress: undefined,
          chainId: undefined,
          signingMode: 'none',
          autonomy: 'no signing authority',
        });
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('delegation relay (away → home)', () => {
    it(
      'relays redeemDelegation to home when away has no bundler',
      async () => {
        // kernel1 (home) has keys; kernel2 (away) has no bundler, no keys.
        await callVatMethod(kernel1, coordinatorKref1, 'initializeKeyring', [
          { type: 'srp', mnemonic: TEST_MNEMONIC },
        ]);

        // Connect away to home.
        const ocapUrl = (await callVatMethod(
          kernel1,
          coordinatorKref1,
          'issueOcapUrl',
        )) as string;
        await callVatMethod(kernel2, coordinatorKref2, 'connectToPeer', [
          ocapUrl,
        ]);

        // Build a grant on home (self-delegation) and send to away.
        const homeAccounts = (await callVatMethod(
          kernel1,
          coordinatorKref1,
          'getAccounts',
        )) as Address[];
        const homeAddr = homeAccounts[0] as Address;

        // Away initializes a throwaway keyring so it has a delegate address.
        await callVatMethod(kernel2, coordinatorKref2, 'initializeKeyring', [
          { type: 'throwaway' },
        ]);
        const awayAccounts = (await callVatMethod(
          kernel2,
          coordinatorKref2,
          'getAccounts',
        )) as Address[];
        // getAccounts on the away coordinator returns the home (peer) account.
        expect(awayAccounts[0]?.toLowerCase()).toBe(homeAddr.toLowerCase());

        // Home builds a grant delegating from home EOA to itself (no smart account).
        const grant = (await callVatMethod(
          kernel1,
          coordinatorKref1,
          'buildTransferNativeGrant',
          [{ delegate: homeAddr, chainId: 11155111 }],
        )) as { delegation: { id: string; status: string } };
        expect(grant.delegation.status).toBe('signed');

        // Transfer the grant to away.
        await callVatMethod(kernel2, coordinatorKref2, 'receiveDelegation', [
          grant,
        ]);
        const awayGrants = (await callVatMethod(
          kernel2,
          coordinatorKref2,
          'listGrants',
        )) as { delegation: { id: string } }[];
        expect(awayGrants).toHaveLength(1);
        expect(awayGrants[0]?.delegation.id).toBe(grant.delegation.id);

        // When away has no bundler and no smart account, redeemDelegation
        // relays to homeCoordRef.redeemDelegation — which fails without a
        // bundler on home too, but the rejection confirms the relay path was
        // taken (not a local "bundler not configured" error on away).
        await expect(
          kernel2.queueMessage(coordinatorKref2, 'redeemDelegation', [
            {
              delegation: grant.delegation,
              execution: {
                target: homeAddr,
                value: '0x0' as Hex,
                callData: '0x' as Hex,
              },
            },
          ]),
        ).rejects.toThrow(/./u);
      },
      NETWORK_TIMEOUT,
    );
  });
});
