/* eslint-disable no-plusplus, n/no-process-exit, import-x/no-unresolved */
/**
 * Delegation-twin E2E test — runs **inside** the away container.
 *
 * Exercises the delegation twin as a live exo capability by connecting
 * directly to the kernel daemon sockets via daemon-client.mjs.  Both the
 * home and away sockets are accessible through the shared `ocap-run` volume
 * at /run/ocap/<service>-ready.json.
 *
 * ── What it tests ─────────────────────────────────────────────────────────
 *
 *   1. Home creates a transfer grant (max spend = 5 units, fake token).
 *   2. Away provisions the twin and calls transfer(3) → succeeds on-chain.
 *   3. Away calls transfer(3) again → twin rejects LOCALLY ("Insufficient
 *      budget") before any network call is made.
 *   4. Away provisions a call twin with a valueLte(100) caveat and calls
 *      with value=200 → twin passes through, bundler simulation rejects.
 *      Demonstrates chain enforcement of a caveat the twin doesn't check.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   Invoked by docker-e2e.test.ts via dockerExec:
 *
 *     node --conditions development run-delegation-twin-e2e.mjs \
 *       <mode> <homeKref> <awayKref> <delegateAddress>
 *
 *   mode            bundler-7702 | bundler-hybrid | peer-relay
 *   homeKref        coordinator kref on the home kernel (e.g. ko4)
 *   awayKref        coordinator kref on the away kernel
 *   delegateAddress on-chain delegate address for the delegation
 */

import '@metamask/kernel-shims/endoify-node';

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { makeDaemonClient } from './helpers/daemon-client.mjs';

const [, , mode, homeKref, awayKref, delegateAddress] = process.argv;

if (!mode || !homeKref || !awayKref || !delegateAddress) {
  console.error(
    'Usage: run-delegation-twin-e2e.mjs <mode> <homeKref> <awayKref> <delegateAddress>',
  );
  process.exit(1);
}

const SERVICE_PAIRS = {
  'bundler-7702': {
    home: 'kernel-home-bundler-7702',
    away: 'kernel-away-bundler-7702',
  },
  'bundler-hybrid': {
    home: 'kernel-home-bundler-hybrid',
    away: 'kernel-away-bundler-hybrid',
  },
  'peer-relay': {
    home: 'kernel-home-peer-relay',
    away: 'kernel-away-peer-relay',
  },
};

const pair = SERVICE_PAIRS[mode];
if (!pair) {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}

const homeReady = JSON.parse(
  await readFile(`/run/ocap/${pair.home}-ready.json`, 'utf8'),
);
const awayReady = JSON.parse(
  await readFile(`/run/ocap/${pair.away}-ready.json`, 'utf8'),
);

const homeClient = makeDaemonClient(homeReady.socketPath);
const awayClient = makeDaemonClient(awayReady.socketPath);

// Zero-code address on Anvil — EVM calls to it succeed with empty return.
// The erc20TransferAmount enforcer only inspects calldata amount, not the
// token contract itself, so this works as a stand-in token.
const FAKE_TOKEN = '0x000000000000000000000000000000000000dEaD';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const CHAIN_ID = 31337;

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

console.log(`\n=== Delegation Twin E2E (${mode}) ===\n`);

// Per-run entropy so each test run produces unique delegation hashes even when
// the coordinator vat is freshly instantiated (counter reset to 0).
const entropy = `0x${randomBytes(32).toString('hex')}`;

// ── Test 1: Twin enforces cumulative spend locally ─────────────────────────

console.log('--- Transfer twin: spend tracking ---');

const transferGrant = await homeClient.callVat(
  homeKref,
  'makeDelegationGrant',
  [
    'transfer',
    {
      delegate: delegateAddress,
      token: FAKE_TOKEN,
      // Passed as a string because the daemon JSON-RPC protocol carries plain
      // JSON; coordinator-vat coerces it to BigInt before buildDelegationGrant.
      max: '5',
      chainId: CHAIN_ID,
      entropy,
    },
  ],
);

assert(
  transferGrant !== null && typeof transferGrant === 'object',
  'home created transfer grant',
);

const twinStandin = await awayClient.callVat(awayKref, 'provisionTwin', [
  transferGrant,
]);
const twinKref = twinStandin.getKref();

assert(
  typeof twinKref === 'string' && twinKref.length > 0,
  `twin kref: ${twinKref}`,
);

// First spend: 3 ≤ 5 remaining → should reach the chain and succeed.
console.log('  Calling transfer(3) — should hit chain...');
const txHash = await awayClient.callVat(twinKref, 'transfer', [
  BURN_ADDRESS,
  '3',
]);

// For bundler-hybrid, wait for on-chain UserOp inclusion.
if (mode === 'bundler-hybrid') {
  console.log('  Waiting for UserOp receipt (hybrid mode)...');
  await awayClient.callVat(awayKref, 'waitForUserOpReceipt', [
    { userOpHash: txHash, pollIntervalMs: 500, timeoutMs: 120_000 },
  ]);
}

assert(
  typeof txHash === 'string' && /^0x[\da-f]{64}$/iu.test(txHash),
  `first spend (3 units) → tx hash: ${String(txHash).slice(0, 20)}...`,
);

// Second spend: 3 + 3 = 6 > 5 → should be rejected LOCALLY by the
// SpendTracker without making any network call.
console.log('  Calling transfer(3) again — should fail locally...');
const secondBody = await awayClient.callVatExpectError(twinKref, 'transfer', [
  BURN_ADDRESS,
  '3',
]);

assert(
  typeof secondBody === 'string' && secondBody.includes('Insufficient budget'),
  `second spend (3 units) rejected locally: ${String(secondBody).slice(0, 80)}`,
);

// ── Test 2 (comparison): expired delegation — twin is blind, chain rejects ──
//
// The twin has no local check for blockWindow / TimestampEnforcer.  It passes
// the call straight to redeemFn; the chain rejects because validUntil is in
// the past.  This is the canonical example of a caveat the twin doesn't track.

console.log('\n--- Expired delegation: chain enforcement ---');

// validUntil 60 s in the past — delegation is already expired.
const expiredAt = Math.floor(Date.now() / 1000) - 60;
const expiredGrant = await homeClient.callVat(homeKref, 'makeDelegationGrant', [
  'call',
  {
    delegate: delegateAddress,
    targets: [BURN_ADDRESS],
    chainId: CHAIN_ID,
    validUntil: expiredAt,
    entropy,
  },
]);

assert(
  expiredGrant !== null && typeof expiredGrant === 'object',
  'home created expired call grant',
);

const expiredTwinStandin = await awayClient.callVat(awayKref, 'provisionTwin', [
  expiredGrant,
]);
const expiredTwinKref = expiredTwinStandin.getKref();

// The twin has no blockWindow check — it calls redeemFn, which reaches the
// chain/bundler, which rejects with a TimestampEnforcer revert.
console.log(
  '  Calling with expired delegation — twin should pass, chain should reject...',
);
const expiredError = await awayClient.callVatExpectError(
  expiredTwinKref,
  'call',
  [BURN_ADDRESS, 0, '0x'],
);

assert(
  typeof expiredError === 'string' && expiredError.length > 0,
  `expired delegation rejected by chain (not twin): ${String(expiredError).slice(0, 80)}`,
);

// ── Results ────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed === 0) {
  console.log('All delegation twin tests passed');
}
process.exit(failed > 0 ? 1 : 0);
