/* eslint-disable no-plusplus, jsdoc/require-returns, jsdoc/require-param-description */
/**
 * Delegation redemption test suite for Docker E2E.
 *
 * Tests delegation redemption (sendTransaction from delegated authority)
 * across different execution modes:
 *
 *   bundler-7702   — away has bundler + EIP-7702 smart account, submits
 *                    UserOps directly via Alto bundler
 *   bundler-hybrid — away has bundler + factory-deployed HybridDeleGator,
 *                    pure ERC-4337 without EIP-7702
 *   peer-relay     — away has no bundler/smart account, relays the
 *                    redemption to home via CapTP (home executes it)
 *
 * The on-chain assertion is the same: ETH moves from the delegator's
 * smart account to a burn address.
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.error(`  \u2717 ${label}`);
  }
}

/**
 * Detect delegation mode from service info.
 *
 * @param {object} awayInfo
 * @returns {'bundler-7702' | 'bundler-hybrid' | 'peer-relay' | 'unknown'} The detected mode.
 */
function detectMode(awayInfo) {
  // Prefer explicit mode written by entrypoint
  if (awayInfo.delegationMode) {
    return awayInfo.delegationMode;
  }
  if (awayInfo.smartAccountAddress && awayInfo.hasBundlerConfig !== false) {
    return 'bundler-7702';
  }
  if (awayInfo.hasPeerWallet) {
    return 'peer-relay';
  }
  return 'unknown';
}

/**
 * Run the delegation redemption test for any mode.
 *
 * @param {object} ctx
 * @param {Function} ctx.callHome
 * @param {Function} ctx.callAway
 * @param {object} ctx.homeInfo
 * @param {object} ctx.awayInfo
 * @param {object} ctx.delegation
 */
export async function runDelegationTests(ctx) {
  const { callHome, callAway, awayInfo } = ctx;
  passed = 0;
  failed = 0;

  const mode = detectMode(awayInfo);
  const homeSA = ctx.homeInfo.smartAccountAddress;

  console.log(`\n--- Delegation mode: ${mode} ---`);
  console.log(`  Delegator (home): ${homeSA || 'none'}`);
  console.log(
    `  Delegate  (away):  ${awayInfo.smartAccountAddress || awayInfo.delegateAddress}`,
  );

  if (!homeSA) {
    console.log('  (skipped — home has no smart account)');
    return { passed, failed };
  }

  const burnAddr = '0x000000000000000000000000000000000000dEaD';
  const sendValue = '0xDE0B6B3A7640000'; // 1 ETH

  // Check burn address balance before
  let balanceBefore;
  try {
    balanceBefore = await callHome('request', [
      'eth_getBalance',
      [burnAddr, 'latest'],
    ]);
  } catch {
    balanceBefore = '0x0';
  }

  // -- Send ETH via delegation --
  try {
    const txHash = await callAway('sendTransaction', [
      {
        from: homeSA,
        to: burnAddr,
        value: sendValue,
      },
    ]);
    assert(
      typeof txHash === 'string' && txHash.startsWith('0x'),
      `[${mode}] sendTransaction returned hash: ${txHash.slice(0, 20)}...`,
    );

    // Verify on-chain: burn address balance increased
    const balanceAfter = await callHome('request', [
      'eth_getBalance',
      [burnAddr, 'latest'],
    ]);
    const before = BigInt(balanceBefore);
    const after = BigInt(balanceAfter);
    assert(
      after > before,
      `[${mode}] burn address balance increased: ${before} → ${after}`,
    );
  } catch (error) {
    assert(
      false,
      `[${mode}] delegation sendTransaction failed: ${error.message}`,
    );
  }

  // -- Verify capabilities reflect the mode --
  try {
    const caps = await callAway('getCapabilities');
    if (mode === 'bundler-7702' || mode === 'bundler-hybrid') {
      assert(
        caps.hasBundlerConfig === true,
        `[${mode}] away has bundler config`,
      );
      assert(
        caps.smartAccountAddress !== undefined,
        `[${mode}] away has smart account`,
      );
    } else if (mode === 'peer-relay') {
      assert(
        caps.hasBundlerConfig === false,
        `[${mode}] away has no bundler config`,
      );
      assert(
        caps.hasPeerWallet === true,
        `[${mode}] away has peer wallet (for relay)`,
      );
      assert(
        typeof caps.autonomy === 'string' && caps.autonomy.includes('relay'),
        `[${mode}] autonomy indicates relay: "${caps.autonomy}"`,
      );
    }
  } catch (error) {
    assert(false, `[${mode}] getCapabilities failed: ${error.message}`);
  }

  return { passed, failed };
}
