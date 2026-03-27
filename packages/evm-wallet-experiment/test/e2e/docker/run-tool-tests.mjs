/* eslint-disable no-plusplus, jsdoc/require-description, jsdoc/require-returns, jsdoc/require-param-description */
/**
 * Tool-level test suite for Docker E2E.
 *
 * Tests individual wallet operations through the daemon socket,
 * verifying signing, delegation, provider queries, and cross-kernel
 * communication against the local Anvil chain.
 */

const EXPECTED_ADDRESS = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

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
 * @param {object} ctx
 * @param {Function} ctx.callHome
 * @param {Function} ctx.callAway
 * @param {object} ctx.homeInfo
 * @param {object} ctx.awayInfo
 * @param {object} ctx.delegation
 * @param {object} ctx.logCollector
 */
export async function runToolTests(ctx) {
  const { callHome, callAway, awayInfo, delegation } = ctx;
  passed = 0;
  failed = 0;

  // -- Home accounts --
  console.log('\n--- Home accounts ---');
  const homeAccounts = await callHome('getAccounts');
  assert(homeAccounts.length === 1, 'home has one account');
  assert(
    homeAccounts[0].toLowerCase() === EXPECTED_ADDRESS,
    `home address: ${homeAccounts[0]}`,
  );

  // -- Home balance (via provider RPC to Anvil) --
  console.log('\n--- Home balance ---');
  try {
    const balanceHex = await callHome('request', [
      'eth_getBalance',
      [homeAccounts[0], 'latest'],
    ]);
    const balanceEth = parseInt(balanceHex, 16) / 1e18;
    assert(balanceEth >= 9900, `home balance: ${balanceEth.toFixed(2)} ETH`);
  } catch (error) {
    assert(false, `home balance query failed: ${error.message}`);
  }

  // -- Home sign message --
  console.log('\n--- Home sign message ---');
  const homeSig = await callHome('signMessage', ['Hello from Docker E2E']);
  assert(
    typeof homeSig === 'string' && homeSig.startsWith('0x'),
    'home sig is hex string',
  );
  assert(homeSig.length === 132, `home sig is 65 bytes (${homeSig.length})`);

  // -- Home sign typed data (EIP-712) --
  console.log('\n--- Home sign typed data ---');
  const typedData = {
    domain: {
      name: 'Test',
      version: '1',
      chainId: 31337,
      verifyingContract: '0x0000000000000000000000000000000000000001',
    },
    types: {
      Mail: [
        { name: 'from', type: 'string' },
        { name: 'to', type: 'string' },
        { name: 'contents', type: 'string' },
      ],
    },
    primaryType: 'Mail',
    message: { from: 'Alice', to: 'Bob', contents: 'Hello!' },
  };
  const homeTypedSig = await callHome('signTypedData', [typedData]);
  assert(
    typeof homeTypedSig === 'string' && homeTypedSig.startsWith('0x'),
    'home typed sig is hex',
  );
  assert(homeTypedSig.length === 132, 'home typed sig is 65 bytes');

  // -- Home provider queries --
  console.log('\n--- Home provider queries ---');
  try {
    const blockNum = await callHome('request', ['eth_blockNumber', []]);
    assert(
      typeof blockNum === 'string' && blockNum.startsWith('0x'),
      `home eth_blockNumber: ${blockNum}`,
    );
  } catch (error) {
    assert(false, `home eth_blockNumber failed: ${error.message}`);
  }

  // -- Away capabilities --
  console.log('\n--- Away capabilities ---');
  try {
    const caps = await callAway('getCapabilities');
    assert(caps.hasLocalKeys === true, 'away has local keys (throwaway)');
    assert(
      caps.delegationCount >= 0,
      `Away delegationCount: ${caps.delegationCount}`,
    );
    console.log(
      `  (hasPeerWallet: ${caps.hasPeerWallet}, delegationCount: ${caps.delegationCount})`,
    );
  } catch (error) {
    assert(false, `Away getCapabilities failed: ${error.message}`);
  }

  // -- Away sign message --
  console.log('\n--- Away sign message ---');
  try {
    const awaySig = await callAway('signMessage', ['Hello from away']);
    assert(
      typeof awaySig === 'string' && awaySig.startsWith('0x'),
      'Away sig is hex string',
    );
    assert(awaySig.length === 132, `Away sig is 65 bytes (${awaySig.length})`);
  } catch (error) {
    // Expected if away has no authority (no peer, no local keys ready)
    console.log(`  (Away signMessage not available: ${error.message})`);
    assert(false, 'Away signMessage');
  }

  // -- Away sign typed data --
  console.log('\n--- Away sign typed data ---');
  try {
    const awayTypedSig = await callAway('signTypedData', [typedData]);
    assert(
      typeof awayTypedSig === 'string' && awayTypedSig.startsWith('0x'),
      'Away typed sig is hex',
    );
  } catch (error) {
    console.log(`  (Away signTypedData not available: ${error.message})`);
    assert(false, 'Away signTypedData');
  }

  // -- List delegations --
  console.log('\n--- List delegations ---');
  try {
    const delegations = await callAway('listDelegations');
    assert(
      delegations.length >= 1,
      `away has ${delegations.length} delegation(s)`,
    );
    if (delegations.length > 0) {
      assert(delegations[0].id === delegation.id, 'correct delegation ID');
      const expectedDelegate =
        awayInfo.smartAccountAddress || awayInfo.delegateAddress;
      assert(
        delegations[0].delegate.toLowerCase() ===
          expectedDelegate.toLowerCase(),
        `correct delegate address: ${expectedDelegate.slice(0, 10)}...`,
      );
    }
  } catch (error) {
    assert(false, `Away listDelegations failed: ${error.message}`);
  }

  // -- Get accounts (away) --
  console.log('\n--- Get accounts (away) ---');
  try {
    const awayAccounts = await callAway('getAccounts');
    assert(
      awayAccounts.length >= 1,
      `away has ${awayAccounts.length} account(s)`,
    );
    console.log(`  Away account: ${awayAccounts[0]}`);
  } catch (error) {
    assert(false, `Away getAccounts failed: ${error.message}`);
  }

  // -- Away provider queries --
  console.log('\n--- Away provider queries ---');
  try {
    const blockNum = await callAway('request', ['eth_blockNumber', []]);
    assert(
      typeof blockNum === 'string' && blockNum.startsWith('0x'),
      `Away eth_blockNumber: ${blockNum}`,
    );
  } catch (error) {
    assert(false, `Away eth_blockNumber failed: ${error.message}`);
  }

  return { passed, failed };
}
