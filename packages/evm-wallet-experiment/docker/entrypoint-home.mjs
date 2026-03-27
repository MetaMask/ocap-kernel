/* eslint-disable */
/**
 * Home kernel entrypoint for Docker E2E testing.
 *
 * Starts a kernel daemon with QUIC transport, initializes the wallet
 * subcluster with test keys, promotes the EOA to a Stateless7702
 * DeleGator smart account, and writes connection info for the away node
 * and test containers to pick up.
 */

import '@metamask/kernel-shims/endoify-node';

import { NodejsPlatformServices } from '@metamask/kernel-node-runtime';
import { startRpcSocketServer } from '@metamask/kernel-node-runtime/daemon';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { makeWalletClusterConfig } from '../src/cluster-config.ts';

// Use $HOME/.ocap/daemon.sock so the kernel CLI can find it
const SOCKET_PATH = join(homedir(), '.ocap', 'daemon.sock');

// Clean stale files from previous runs
mkdirSync(dirname(SOCKET_PATH), { recursive: true });
try { unlinkSync('/run/ocap/home-info.json'); } catch { /* ok */ }
try { unlinkSync('/run/ocap/away-info.json'); } catch { /* ok */ }
try { unlinkSync(SOCKET_PATH); } catch { /* ok */ }

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const QUIC_LISTEN_ADDRESS = '/ip4/0.0.0.0/udp/4001/quic-v1';
const BUNDLE_BASE_URL = new URL('../src/vats', import.meta.url).toString();
const INFO_PATH = '/run/ocap/home-info.json';

async function main() {
  console.log('[home] Booting kernel...');
  const db = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
  const kernel = await Kernel.make(new NodejsPlatformServices({}), db, {
    resetStorage: true,
  });
  await kernel.initIdentity();

  console.log('[home] Starting RPC socket server...');
  await startRpcSocketServer({ socketPath: SOCKET_PATH, kernel, kernelDatabase: db });
  console.log(`[home] Socket: ${SOCKET_PATH}`);

  console.log('[home] Initializing QUIC transport...');
  await kernel.initRemoteComms({
    directListenAddresses: [QUIC_LISTEN_ADDRESS],
  });

  // Wait for connected state
  let status = await kernel.getStatus();
  const deadline = Date.now() + 30_000;
  while (status.remoteComms?.state !== 'connected' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    status = await kernel.getStatus();
  }
  if (status.remoteComms?.state !== 'connected') {
    console.error('[home] FATAL: Remote comms failed to connect');
    process.exit(1);
  }
  const { peerId, listenAddresses } = status.remoteComms;
  console.log(`[home] Peer ID: ${peerId.slice(0, 16)}...`);

  // Read deployed contract addresses (written by deploy-contracts.mjs)
  const contractsPath = '/run/ocap/contracts.json';
  const contracts = existsSync(contractsPath)
    ? JSON.parse(readFileSync(contractsPath, 'utf-8'))
    : {};
  if (contracts.DelegationManager) {
    console.log(`[home] DelegationManager: ${contracts.DelegationManager}`);
  }

  console.log('[home] Launching wallet subcluster...');
  const walletConfig = makeWalletClusterConfig({
    bundleBaseUrl: BUNDLE_BASE_URL,
    allowedHosts: ['evm:8545', 'bundler:4337'],
    ...(contracts.DelegationManager
      ? { delegationManagerAddress: contracts.DelegationManager }
      : {}),
  });
  const { rootKref } = await kernel.launchSubcluster(walletConfig);
  await waitUntilQuiescent();
  console.log(`[home] Coordinator: ${rootKref}`);

  console.log('[home] Initializing keyring...');
  const initResult = await kernel.queueMessage(rootKref, 'initializeKeyring', [
    { type: 'srp', mnemonic: TEST_MNEMONIC },
  ]);
  await waitUntilQuiescent();
  kunser(initResult);

  console.log('[home] Configuring provider (Anvil)...');
  const provResult = await kernel.queueMessage(rootKref, 'configureProvider', [
    { chainId: 31337, rpcUrl: 'http://evm:8545' },
  ]);
  await waitUntilQuiescent();
  kunser(provResult);

  // Register the environment so createSmartAccount can resolve contract addresses
  let smartAccountAddress;
  if (contracts.EntryPoint) {
    console.log('[home] Configuring bundler (for environment registration)...');
    const bundlerResult = await kernel.queueMessage(rootKref, 'configureBundler', [
      { bundlerUrl: 'http://bundler:4337', chainId: 31337, entryPoint: contracts.EntryPoint, environment: contracts },
    ]);
    await waitUntilQuiescent();
    kunser(bundlerResult);

    // Promote the home EOA to a Stateless7702 DeleGator smart account.
    // With EIP-7702, the EOA address itself becomes the smart account —
    // no factory deployment needed. The EOA already has 10,000 ETH from Anvil.
    console.log('[home] Creating stateless7702 smart account...');
    const saResult = await kernel.queueMessage(rootKref, 'createSmartAccount', [
      { chainId: 31337, implementation: 'stateless7702' },
    ]);
    await waitUntilQuiescent();
    const saConfig = kunser(saResult);
    smartAccountAddress = saConfig.address;
    console.log(`[home] Smart account (7702): ${saConfig.address}`);
  }

  console.log('[home] Issuing OCAP URL...');
  const urlResult = await kernel.queueMessage(rootKref, 'issueOcapUrl', []);
  await waitUntilQuiescent();
  const ocapUrl = kunser(urlResult);
  console.log(`[home] OCAP URL: ${ocapUrl.slice(0, 40)}...`);

  const info = {
    ocapUrl,
    peerId,
    listenAddresses,
    quicAddresses: listenAddresses.filter((a) => a.includes('/quic-v1/')),
    coordinatorKref: rootKref,
    ...(smartAccountAddress ? { smartAccountAddress } : {}),
  };
  writeFileSync(INFO_PATH, JSON.stringify(info, null, 2));
  console.log(`[home] Info written to ${INFO_PATH}`);
  console.log('[home] Ready. Waiting...');

  // Keep alive
  setInterval(() => {}, 60_000);
}

main().catch((error) => {
  console.error('[home] FATAL:', error);
  process.exit(1);
});
