/* eslint-disable */
/**
 * Create a delegation on the home kernel and push it to the away node over CapTP.
 *
 * Connects to the home daemon socket only — the delegation flows to the
 * away node through the existing peer (OCAP) connection, exercising the real
 * cross-kernel path.
 *
 * Usage:
 *   node --conditions development /app/packages/evm-wallet-experiment/docker/create-delegation.mjs
 *
 * Options (env vars):
 *   CAVEAT_ETH_LIMIT  — total native-token transfer limit in ETH (default: unlimited)
 */

import '@metamask/kernel-shims/endoify-node';

import { readFileSync } from 'node:fs';

import { makeDaemonClient } from '../test/e2e/docker/helpers/daemon-client.mjs';

const HOME_INFO = '/run/ocap/home-info.json';
const AWAY_INFO = '/run/ocap/away-info.json';
const HOME_SOCKET = '/run/ocap/home.sock';

async function main() {
  const homeInfo = JSON.parse(readFileSync(HOME_INFO, 'utf8'));
  const awayInfo = JSON.parse(readFileSync(AWAY_INFO, 'utf8'));

  const home = makeDaemonClient(HOME_SOCKET);

  const callHome = (method, args) =>
    home.callVat(homeInfo.coordinatorKref, method, args);

  // Use smart account address as delegate if available (required for UserOp
  // submission). Fall back to EOA delegate for non-bundler delegation flows.
  const delegate = awayInfo.smartAccountAddress || awayInfo.delegateAddress;

  console.log(`[delegation] home coordinator: ${homeInfo.coordinatorKref}`);
  console.log(`[delegation] away delegate: ${delegate}${awayInfo.smartAccountAddress ? ' (smart account)' : ' (EOA)'}`);

  // Build caveats from env vars (empty = unlimited)
  const caveats = [];
  const ethLimit = process.env.CAVEAT_ETH_LIMIT;
  if (ethLimit) {
    const wei = BigInt(Math.floor(Number(ethLimit) * 1e18));
    const terms = `0x${wei.toString(16).padStart(64, '0')}`;
    caveats.push({
      type: 'nativeTokenTransferAmount',
      enforcer: '0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320',
      terms,
    });
    console.log(`[delegation] caveat: nativeTokenTransferAmount <= ${ethLimit} ETH`);
  }

  console.log('[delegation] creating on home...');
  const delegation = await callHome('createDelegation', [
    { delegate, caveats, chainId: 31337 },
  ]);
  console.log(`[delegation] id: ${delegation.id}`);
  console.log(`[delegation] status: ${delegation.status}`);

  console.log('[delegation] pushing to away over CapTP...');
  await callHome('pushDelegationToAway', [delegation]);
  console.log('[delegation] done — away received the delegation over the peer connection.');
}

main().catch((err) => {
  console.error('[delegation] FATAL:', err);
  process.exit(1);
});
