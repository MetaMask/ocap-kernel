import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { CapData, KRef } from '@metamask/ocap-kernel';
import { NodejsPlatformServices } from '@ocap/nodejs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeWalletClusterConfig } from '../../src/cluster-config.ts';
import { SEPOLIA_CHAIN_ID } from '../../src/constants.ts';
import type { Address, Hex } from '../../src/types.ts';

// eslint-disable-next-line n/no-process-env
const { PIMLICO_API_KEY } = process.env;
// eslint-disable-next-line n/no-process-env
const { SEPOLIA_RPC_URL } = process.env;
const HAS_ENV = Boolean(PIMLICO_API_KEY && SEPOLIA_RPC_URL);

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const BUNDLE_BASE_URL = new URL('../../src/vats', import.meta.url).toString();
const TARGET = '0x0000000000000000000000000000000000000000' as Address;
const DEPLOY_SALT =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

const USEROP_TIMEOUT = 120_000;

/**
 * Call a method on a vat root object and deserialize the result.
 *
 * @param kernel - The kernel.
 * @param target - The target KRef.
 * @param method - The method name.
 * @param args - The arguments.
 * @returns The deserialized result.
 */
async function callVatMethod(
  kernel: Kernel,
  target: KRef,
  method: string,
  args: unknown[] = [],
): Promise<unknown> {
  const result: CapData<KRef> = await kernel.queueMessage(target, method, args);
  await waitUntilQuiescent();
  return kunser(result);
}

describe.skipIf(!HAS_ENV)('Sepolia E2E', () => {
  let kernelDb: Awaited<ReturnType<typeof makeSQLKernelDatabase>>;
  let kernel: Kernel;
  let coordinatorKref: KRef;

  beforeEach(async () => {
    kernelDb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
    const platformServices = new NodejsPlatformServices({});
    kernel = await Kernel.make(platformServices, kernelDb, {
      resetStorage: true,
    });

    const config = makeWalletClusterConfig({
      bundleBaseUrl: BUNDLE_BASE_URL,
    });
    const result = await kernel.launchSubcluster(config);
    await waitUntilQuiescent();
    coordinatorKref = result.rootKref;
  });

  afterEach(async () => {
    try {
      await kernel.stop();
    } catch {
      // ignore cleanup errors
    }
  });

  it(
    'creates a smart account, delegates, and redeems via UserOp',
    async () => {
      // 1. Initialize keyring
      await callVatMethod(kernel, coordinatorKref, 'initializeKeyring', [
        { type: 'srp', mnemonic: TEST_MNEMONIC },
      ]);

      const accounts = (await callVatMethod(
        kernel,
        coordinatorKref,
        'getAccounts',
      )) as Address[];
      expect(accounts.length).toBeGreaterThan(0);

      // 2. Configure provider for Sepolia
      await callVatMethod(kernel, coordinatorKref, 'configureProvider', [
        { chainId: SEPOLIA_CHAIN_ID, rpcUrl: SEPOLIA_RPC_URL },
      ]);

      // 3. Configure bundler with Pimlico paymaster
      const bundlerUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${PIMLICO_API_KEY}`;
      await callVatMethod(kernel, coordinatorKref, 'configureBundler', [
        { bundlerUrl, chainId: SEPOLIA_CHAIN_ID, usePaymaster: true },
      ]);

      // 4. Create a Hybrid smart account
      const smartConfig = (await callVatMethod(
        kernel,
        coordinatorKref,
        'createSmartAccount',
        [{ deploySalt: DEPLOY_SALT, chainId: SEPOLIA_CHAIN_ID }],
      )) as { address: Address };
      expect(smartConfig.address).toMatch(/^0x[\da-f]{40}$/iu);

      // 5. Create a delegation (self-delegation: smart account → smart account)
      const delegation = (await callVatMethod(
        kernel,
        coordinatorKref,
        'createDelegation',
        [
          {
            delegate: smartConfig.address,
            caveats: [],
            chainId: SEPOLIA_CHAIN_ID,
          },
        ],
      )) as { id: string; status: string; delegator: Address };
      expect(delegation.status).toBe('signed');
      expect(delegation.delegator).toBe(smartConfig.address);

      // 6. Redeem the delegation via a UserOp (paymaster sponsors gas)
      const userOpHash = (await callVatMethod(
        kernel,
        coordinatorKref,
        'redeemDelegation',
        [
          {
            execution: {
              target: TARGET,
              value: '0x0' as Hex,
              callData: '0x' as Hex,
            },
            delegationId: delegation.id,
          },
        ],
      )) as Hex;
      expect(userOpHash).toMatch(/^0x[\da-f]{64}$/iu);

      // 7. Wait for the UserOp to be included on-chain
      const receipt = await callVatMethod(
        kernel,
        coordinatorKref,
        'waitForUserOpReceipt',
        [{ userOpHash, pollIntervalMs: 3000, timeoutMs: USEROP_TIMEOUT }],
      );
      expect(receipt).toBeDefined();
    },
    USEROP_TIMEOUT + 30_000,
  );
});
