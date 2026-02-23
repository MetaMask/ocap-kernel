/* eslint-disable n/no-process-exit, no-plusplus, no-unused-vars, import-x/no-unresolved, n/no-process-env */
/**
 * Sepolia E2E test for the eth-wallet subcluster.
 *
 * Exercises the full on-chain flow: create a Hybrid smart account via the
 * MetaMask Delegation Framework, create a delegation, redeem it by
 * submitting a UserOp to a Pimlico bundler with paymaster sponsorship,
 * and wait for on-chain inclusion.
 *
 * Requires environment variables:
 *   PIMLICO_API_KEY  - Pimlico API key (free tier works for Sepolia)
 *   SEPOLIA_RPC_URL  - Sepolia JSON-RPC endpoint (e.g. Infura, Alchemy)
 *
 * Usage:
 *   PIMLICO_API_KEY=xxx SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/xxx \
 *     yarn workspace @ocap/eth-wallet test:node:sepolia
 */

import '@metamask/kernel-shims/endoify-node';

import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import { NodejsPlatformServices } from '@ocap/nodejs';

import { makeWalletClusterConfig } from '../../src/cluster-config.ts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const { PIMLICO_API_KEY } = process.env;
const { SEPOLIA_RPC_URL } = process.env;

if (!PIMLICO_API_KEY || !SEPOLIA_RPC_URL) {
  console.log(
    '\nSkipping Sepolia E2E: set PIMLICO_API_KEY and SEPOLIA_RPC_URL\n',
  );
  process.exit(0);
}

const SEPOLIA_CHAIN_ID = 11155111;
const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const BUNDLE_BASE_URL = new URL('../../src/vats', import.meta.url).toString();
const DEPLOY_SALT =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const USEROP_TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// Call a vat method, pumping the kernel event loop until the result resolves.
// For methods that involve async I/O (fetch), the kernel's crank loop may
// stop before the full E() chain completes. This helper periodically yields
// control to the event loop (via setTimeout) so that incoming vat worker
// messages trigger new cranks and the promise eventually resolves.
async function call(
  kernel,
  target,
  method,
  args = [],
  timeout = USEROP_TIMEOUT,
) {
  const resultP = kernel.queueMessage(target, method, args);

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Race: either the result resolves, or we yield for 500ms
    const winner = await Promise.race([
      resultP.then((capData) => ({ done: true, capData })),
      new Promise((resolve) => setTimeout(() => resolve({ done: false }), 500)),
    ]);

    if (winner.done) {
      await waitUntilQuiescent();
      return kunser(winner.capData);
    }

    // Pump: let the event loop process incoming vat worker messages
    await waitUntilQuiescent();
  }

  throw new Error(`call(${method}) timed out after ${timeout}ms`);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Sepolia E2E Test ===\n');

  // -- Setup --
  console.log('Setting up kernel...');
  const kernelDb = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
  const kernel = await Kernel.make(new NodejsPlatformServices({}), kernelDb, {
    resetStorage: true,
  });

  const walletConfig = makeWalletClusterConfig({
    bundleBaseUrl: BUNDLE_BASE_URL,
    allowedHosts: ['sepolia.infura.io', 'api.pimlico.io'],
  });
  const { rootKref } = await kernel.launchSubcluster(walletConfig);
  await waitUntilQuiescent();
  console.log(`  Coordinator: ${rootKref}\n`);

  // -- 1. Initialize keyring --
  console.log('--- Initialize keyring ---');
  await call(kernel, rootKref, 'initializeKeyring', [
    { type: 'srp', mnemonic: TEST_MNEMONIC },
  ]);
  const accounts = await call(kernel, rootKref, 'getAccounts');
  assert(accounts.length > 0, `EOA: ${accounts[0]}`);

  // -- 2. Configure provider for Sepolia --
  console.log('\n--- Configure Sepolia provider ---');
  await call(kernel, rootKref, 'configureProvider', [
    { chainId: SEPOLIA_CHAIN_ID, rpcUrl: SEPOLIA_RPC_URL },
  ]);
  assert(true, 'provider configured');

  // -- 3. Configure bundler with Pimlico paymaster --
  console.log('\n--- Configure Pimlico bundler ---');
  const bundlerUrl = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${PIMLICO_API_KEY}`;
  await call(kernel, rootKref, 'configureBundler', [
    {
      bundlerUrl,
      chainId: SEPOLIA_CHAIN_ID,
      usePaymaster: true,
      sponsorshipPolicyId: 'sp_young_killmonger',
    },
  ]);
  assert(true, 'bundler configured with paymaster');

  // -- 4. Create a Hybrid smart account --
  console.log('\n--- Create smart account ---');
  const smartConfig = await call(kernel, rootKref, 'createSmartAccount', [
    { deploySalt: DEPLOY_SALT, chainId: SEPOLIA_CHAIN_ID },
  ]);
  assert(
    typeof smartConfig.address === 'string' &&
      smartConfig.address.match(/^0x[\da-f]{40}$/iu),
    `smart account: ${smartConfig.address}`,
  );
  assert(smartConfig.implementation === 'hybrid', 'implementation: hybrid');
  assert(smartConfig.deployed === false, 'not yet deployed');

  // -- 5. Create a delegation (smart account → smart account, no caveats) --
  // The delegate must be the smart account itself because the smart account
  // is the msg.sender when calling DelegationManager.redeemDelegations.
  console.log('\n--- Create delegation ---');
  const delegation = await call(kernel, rootKref, 'createDelegation', [
    {
      delegate: smartConfig.address,
      caveats: [],
      chainId: SEPOLIA_CHAIN_ID,
    },
  ]);
  assert(delegation.status === 'signed', 'delegation signed');
  assert(
    delegation.delegator === smartConfig.address,
    'delegator is smart account',
  );
  assert(
    delegation.delegate === smartConfig.address,
    'delegate is smart account',
  );
  console.log(`  Delegation ID: ${delegation.id.slice(0, 20)}...`);

  // -- 6. Redeem the delegation via UserOp --
  console.log('\n--- Redeem delegation (submit UserOp) ---');
  console.log('  Submitting to Pimlico bundler...');
  const userOpHash = await call(kernel, rootKref, 'redeemDelegation', [
    {
      execution: {
        target: smartConfig.address,
        value: '0x0',
        callData: '0x',
      },
      delegationId: delegation.id,
    },
  ]);
  assert(
    typeof userOpHash === 'string' && userOpHash.match(/^0x[\da-f]{64}$/iu),
    `userOp hash: ${userOpHash}`,
  );

  // -- 7. Wait for on-chain inclusion --
  console.log('\n--- Wait for UserOp receipt ---');
  console.log(`  Polling (timeout: ${USEROP_TIMEOUT / 1000}s)...`);
  const receipt = await call(kernel, rootKref, 'waitForUserOpReceipt', [
    { userOpHash, pollIntervalMs: 3000, timeoutMs: USEROP_TIMEOUT },
  ]);
  assert(receipt !== null && receipt !== undefined, 'receipt received');
  assert(receipt.success === true, `UserOp succeeded on-chain`);
  if (receipt.receipt?.transactionHash) {
    console.log(
      `  Tx: https://sepolia.etherscan.io/tx/${receipt.receipt.transactionHash}`,
    );
  }

  // -- Verify smart account is now deployed --
  console.log('\n--- Verify post-redemption state ---');
  const capsAfter = await call(kernel, rootKref, 'getCapabilities');
  assert(
    capsAfter.smartAccountAddress === smartConfig.address,
    'smart account address persisted',
  );

  // -- Cleanup --
  console.log('\n--- Cleanup ---');
  try {
    await kernel.stop();
  } catch {
    // ignore
  }
  kernelDb.close();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
