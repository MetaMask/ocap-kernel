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
import {
  buildCaveatsFromEnv,
  createDelegationForDockerStack,
  pushDelegationOverPeer,
  resolveOnChainDelegateForDockerMode,
} from '../test/e2e/docker/helpers/delegation-transfer.mjs';

const HOME_INFO = '/run/ocap/home-info.json';
const AWAY_INFO = '/run/ocap/away-info.json';
const HOME_SOCKET = '/run/ocap/home.sock';

async function main() {
  const homeInfo = JSON.parse(readFileSync(HOME_INFO, 'utf8'));
  const awayInfo = JSON.parse(readFileSync(AWAY_INFO, 'utf8'));
  const delegationMode = process.env.DELEGATION_MODE ?? 'bundler-7702';

  const home = makeDaemonClient(HOME_SOCKET);

  const callHome = (method, args) =>
    home.callVat(homeInfo.coordinatorKref, method, args);

  const delegate = resolveOnChainDelegateForDockerMode({
    delegationMode,
    homeInfo,
    awayInfo,
  });
  console.log(`[delegation] home coordinator: ${homeInfo.coordinatorKref}`);
  console.log(`[delegation] mode: ${delegationMode}`);
  console.log(
    `[delegation] on-chain delegate: ${delegate}${
      delegationMode === 'peer-relay'
        ? ' (home; peer-relay redeem)'
        : awayInfo.smartAccountAddress
          ? ' (away smart account)'
          : ' (away EOA)'
    }`,
  );

  const caveats = buildCaveatsFromEnv();
  const ethLimit = process.env.CAVEAT_ETH_LIMIT;
  if (ethLimit) {
    console.log(
      `[delegation] caveat: nativeTokenTransferAmount <= ${ethLimit} ETH`,
    );
  }

  console.log('[delegation] creating on home...');
  const delegation = await createDelegationForDockerStack({
    callHome,
    awayInfo,
    homeInfo,
    delegationMode,
    caveats,
  });
  console.log(`[delegation] id: ${delegation.id}`);
  console.log(`[delegation] status: ${delegation.status}`);

  console.log('[delegation] pushing to away over CapTP...');
  await pushDelegationOverPeer(callHome, delegation);
  console.log(
    '[delegation] done — away received the delegation over the peer connection.',
  );
}

main().catch((err) => {
  console.error('[delegation] FATAL:', err);
  process.exit(1);
});
