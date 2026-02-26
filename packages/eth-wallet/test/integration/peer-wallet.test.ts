import type { KernelDatabase } from '@metamask/kernel-store';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { KRef } from '@metamask/ocap-kernel';
import { NodejsPlatformServices } from '@ocap/nodejs';
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
    const walletConfig = makeWalletClusterConfig({
      bundleBaseUrl: BUNDLE_BASE_URL,
    });

    const result1 = await kernel1.launchSubcluster(walletConfig);
    await waitUntilQuiescent();
    coordinatorKref1 = result1.rootKref;

    const result2 = await kernel2.launchSubcluster(walletConfig);
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
    /**
     * Set up the peer wallet connection between kernel1 (owner) and kernel2 (delegate).
     */
    async function setupPeerConnection(): Promise<void> {
      // Initialize keyring on kernel1
      await callVatMethod(kernel1, coordinatorKref1, 'initializeKeyring', [
        { type: 'srp', mnemonic: TEST_MNEMONIC },
      ]);

      // Issue + connect
      const ocapUrl = (await callVatMethod(
        kernel1,
        coordinatorKref1,
        'issueOcapUrl',
      )) as string;
      await callVatMethod(kernel2, coordinatorKref2, 'connectToPeer', [
        ocapUrl,
      ]);
    }

    it(
      'forwards message signing to peer wallet',
      async () => {
        await setupPeerConnection();

        // Kernel2 has no local keys; signing should forward to kernel1
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
      'rejects remote transaction signing (no peer fallback)',
      async () => {
        await setupPeerConnection();

        const accounts = (await callVatMethod(
          kernel1,
          coordinatorKref1,
          'getAccounts',
        )) as Address[];

        const tx: TransactionRequest = {
          from: accounts[0] as Address,
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
          value: '0xde0b6b3a7640000' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        };

        // Transaction signing has no peer fallback — kernel2 has no local
        // keys so this should return an error, not forward to kernel1.
        const result = await kernel2.queueMessage(
          coordinatorKref2,
          'signTransaction',
          [tx],
        );
        await waitUntilQuiescent();
        expect(result.body).toContain('#error');
        expect(result.body).toContain('No authority to sign this transaction');
      },
      NETWORK_TIMEOUT,
    );
  });

  describe('no authority', () => {
    it(
      'returns error when no local keys and no peer wallet',
      async () => {
        // Kernel2 has no keys and no peer wallet connected
        // queueMessage resolves with error CapData (not rejects)
        const result = await kernel2.queueMessage(
          coordinatorKref2,
          'signMessage',
          ['should fail'],
        );
        await waitUntilQuiescent();
        // Error CapData body contains #error marker
        expect(result.body).toContain('#error');
        expect(result.body).toContain('No authority to sign message');
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
          hasPeerWallet: false,
          hasExternalSigner: false,
          hasBundlerConfig: false,
          smartAccountAddress: undefined,
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
        });
      },
      NETWORK_TIMEOUT,
    );
  });
});
