/**
 * Named scenario compositions for Docker E2E tests.
 *
 * Each function is a flat sequence of wallet-setup primitives. The caller
 * chooses which scenario to run — no branching happens here.
 */

import {
  configureBundler,
  configureProvider,
  connectToPeer,
  createSmartAccount,
  finalizeAwayPeerSetup,
  fundAddress,
  getServiceInfo,
  initKeyring,
  issueOcapUrl,
  launchWalletSubcluster,
  preDeploySmartAccount,
  registerLocationHints,
} from './wallet-setup.ts';
import type { ContractAddresses } from './wallet-setup.ts';

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

const CHAIN_ID = 31337;
const EVM_RPC_URL = 'http://evm:8545';
const BUNDLER_URL = 'http://bundler:4337';
const ALLOWED_HOSTS = ['evm:8545', 'bundler:4337'];

export type HomeResult = {
  kref: string;
  peerId: string;
  listenAddresses: string[];
  ocapUrl: string;
  address: string;
  smartAccountAddress: string;
};

export type AwayResult = {
  kref: string;
  delegateAddress: string;
  smartAccountAddress?: string;
};

/**
 * Set up the home kernel with a full wallet: SRP keyring, provider,
 * bundler, 7702 smart account, and an OCAP URL for peer connection.
 *
 * @param contracts - Deployed contract addresses from the EVM container.
 * @returns Home wallet info needed by away setup and tests.
 */
export function setupHome(contracts: ContractAddresses): HomeResult {
  const info = getServiceInfo('home');

  const kref = launchWalletSubcluster('home', {
    contracts,
    allowedHosts: ALLOWED_HOSTS,
  });

  const address = initKeyring('home', kref, {
    type: 'srp',
    mnemonic: TEST_MNEMONIC,
  });

  configureProvider('home', kref, {
    chainId: CHAIN_ID,
    rpcUrl: EVM_RPC_URL,
  });

  configureBundler('home', kref, {
    bundlerUrl: BUNDLER_URL,
    chainId: CHAIN_ID,
    entryPoint: contracts.EntryPoint,
    environment: contracts,
  });

  const { address: smartAccountAddress } = createSmartAccount('home', kref, {
    chainId: CHAIN_ID,
    implementation: 'stateless7702',
  });

  const ocapUrl = issueOcapUrl('home', kref);

  return {
    kref,
    peerId: info.peerId as string,
    listenAddresses: info.listenAddresses as string[],
    ocapUrl,
    address,
    smartAccountAddress,
  };
}

/**
 * Common away setup steps shared across all delegation modes:
 * launch subcluster, init throwaway keyring, configure provider,
 * register home peer hints, connect to home.
 *
 * @param contracts - Deployed contract addresses.
 * @param home - Home setup result (for peer connection).
 * @returns The coordinator kref and delegate address.
 */
function setupAwayBase(
  contracts: ContractAddresses,
  home: HomeResult,
): { kref: string; delegateAddress: string } {
  const kref = launchWalletSubcluster('away', {
    contracts,
    allowedHosts: ALLOWED_HOSTS,
  });

  const delegateAddress = initKeyring('away', kref, { type: 'throwaway' });

  configureProvider('away', kref, {
    chainId: CHAIN_ID,
    rpcUrl: EVM_RPC_URL,
  });

  registerLocationHints('away', home.peerId, home.listenAddresses);
  connectToPeer('away', kref, home.ocapUrl);

  return { kref, delegateAddress };
}

/**
 * Set up away with bundler + EIP-7702 stateless smart account.
 *
 * @param contracts - Deployed contract addresses.
 * @param home - Home setup result (for peer connection).
 * @returns Away wallet info.
 */
export async function setup7702Away(
  contracts: ContractAddresses,
  home: HomeResult,
): Promise<AwayResult> {
  const { kref, delegateAddress } = setupAwayBase(contracts, home);

  configureBundler('away', kref, {
    bundlerUrl: BUNDLER_URL,
    chainId: CHAIN_ID,
    entryPoint: contracts.EntryPoint,
    environment: contracts,
  });

  await fundAddress(delegateAddress, 10);

  const { address: smartAccountAddress } = createSmartAccount('away', kref, {
    chainId: CHAIN_ID,
    implementation: 'stateless7702',
  });

  await finalizeAwayPeerSetup('away', kref, smartAccountAddress);

  return { kref, delegateAddress, smartAccountAddress };
}

/**
 * Set up away with bundler + factory-deployed HybridDeleGator.
 *
 * @param contracts - Deployed contract addresses.
 * @param home - Home setup result (for peer connection).
 * @returns Away wallet info.
 */
export async function setupHybridAway(
  contracts: ContractAddresses,
  home: HomeResult,
): Promise<AwayResult> {
  const { kref, delegateAddress } = setupAwayBase(contracts, home);

  configureBundler('away', kref, {
    bundlerUrl: BUNDLER_URL,
    chainId: CHAIN_ID,
    entryPoint: contracts.EntryPoint,
    environment: contracts,
  });

  const sa = createSmartAccount('away', kref, { chainId: CHAIN_ID });

  if (sa.factory && sa.factoryData) {
    await preDeploySmartAccount(sa.factory, sa.factoryData);
    await fundAddress(sa.address, 10);
  }

  await finalizeAwayPeerSetup('away', kref, sa.address);

  return { kref, delegateAddress, smartAccountAddress: sa.address };
}

/**
 * Set up away with peer-relay mode (no bundler, no smart account).
 * After connecting to home, runs the same post-connect steps as setup-away.sh
 * (wait for peer wallet, refreshPeerAccounts, sendDelegateAddressToPeer).
 *
 * @param contracts - Deployed contract addresses.
 * @param home - Home setup result (for peer connection).
 * @returns Away wallet info.
 */
export async function setupPeerRelayAway(
  contracts: ContractAddresses,
  home: HomeResult,
): Promise<AwayResult> {
  const { kref, delegateAddress } = setupAwayBase(contracts, home);
  await finalizeAwayPeerSetup('away', kref, delegateAddress);
  return { kref, delegateAddress };
}
