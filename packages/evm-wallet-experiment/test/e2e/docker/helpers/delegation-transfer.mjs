/* eslint-disable n/no-process-env */
/**
 * Shared delegation flow for the Docker stack: create on home, push to away over CapTP.
 * Used by `docker/create-delegation.mjs`.
 */

import { dockerConfig } from '../../../../docker/docker-e2e-stack-constants.mjs';

const NATIVE_TRANSFER_ENFORCER = '0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320';

/**
 * Prefer smart-account delegate when present, else EOA delegate from away info.
 *
 * @param {Record<string, unknown>} awayInfo - Parsed `away-info.json`.
 * @returns {string} On-chain delegate address for the away wallet.
 */
export function resolveDelegateForAway(awayInfo) {
  return awayInfo.smartAccountAddress || awayInfo.delegateAddress;
}

/**
 * Build caveat list from env. When `CAVEAT_ETH_LIMIT` is set, caps native-token spend.
 *
 * @returns {Array<Record<string, unknown>>} Caveat objects for `createDelegation`.
 */
export function buildCaveatsFromEnv() {
  const caveats = [];
  const ethLimit = process.env.CAVEAT_ETH_LIMIT;
  if (ethLimit) {
    const wei = BigInt(Math.floor(Number(ethLimit) * 1e18));
    const terms = `0x${wei.toString(16).padStart(64, '0')}`;
    caveats.push({
      type: 'nativeTokenTransferAmount',
      enforcer: NATIVE_TRANSFER_ENFORCER,
      terms,
    });
  }
  return caveats;
}

/**
 * Create a signed delegation on the home coordinator for the away delegate.
 *
 * @param {object} options - Arguments.
 * @param {(method: string, args: unknown[]) => Promise<unknown>} options.callHome - Home coordinator `callVat` wrapper.
 * @param {Record<string, unknown>} options.awayInfo - Parsed `away-info.json`.
 * @param {Array<Record<string, unknown>>} [options.caveats] - Optional caveats (default none).
 * @returns {Promise<Record<string, unknown>>} Created delegation record from the coordinator.
 */
export async function createDelegationForDockerStack({
  callHome,
  awayInfo,
  caveats = [],
}) {
  const delegate = resolveDelegateForAway(awayInfo);
  return callHome('createDelegation', [
    { delegate, caveats, chainId: dockerConfig.anvilChainId },
  ]);
}

/**
 * Push a signed delegation to the peer away wallet (CapTP), from the home coordinator.
 *
 * @param {(method: string, args: unknown[]) => Promise<unknown>} callHome - Home coordinator `callVat` wrapper.
 * @param {Record<string, unknown>} delegation - Delegation object from `createDelegation`.
 */
export async function pushDelegationOverPeer(callHome, delegation) {
  await callHome('pushDelegationToAway', [delegation]);
}
