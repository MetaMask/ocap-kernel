/* eslint-disable */
/**
 * Away kernel entrypoint for Docker E2E testing.
 *
 * Starts a kernel daemon with QUIC transport, waits for the home kernel
 * to publish its connection info, establishes a peer connection, and
 * promotes a throwaway EOA to a Stateless7702 DeleGator smart account
 * for delegation testing.
 */

import '@metamask/kernel-shims/endoify-node';

import { NodejsPlatformServices } from '@metamask/kernel-node-runtime';
import { startRpcSocketServer } from '@metamask/kernel-node-runtime/daemon';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve as dnsResolve } from 'node:dns/promises';

import { makeWalletClusterConfig } from '../src/cluster-config.ts';

const QUIC_LISTEN_ADDRESS = '/ip4/0.0.0.0/udp/4002/quic-v1';
const BUNDLE_BASE_URL = new URL('../src/vats', import.meta.url).toString();
const SOCKET_PATH = '/run/ocap/away.sock';
const HOME_INFO_PATH = '/run/ocap/home-info.json';
const AWAY_INFO_PATH = '/run/ocap/away-info.json';
const CONTRACTS_PATH = '/run/ocap/contracts.json';
const BUNDLER_URL = 'http://bundler:4337';
const EVM_RPC = 'http://evm:8545';
// Anvil account #0 — used to fund the throwaway EOA
const FUNDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

async function waitForFile(filePath, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

/**
 * Resolve Docker container hostname to IP and rewrite QUIC multiaddrs.
 * Docker bridge networking uses container DNS names, but libp2p needs IPs.
 */
async function resolveQuicAddresses(quicAddresses) {
  const resolved = [];
  for (const addr of quicAddresses) {
    const parts = addr.split('/');
    const ip4Idx = parts.indexOf('ip4');
    if (ip4Idx !== -1) {
      const host = parts[ip4Idx + 1];
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        resolved.push(addr);
      } else {
        try {
          const ips = await dnsResolve(host);
          if (ips.length > 0) {
            parts[ip4Idx + 1] = ips[0];
            resolved.push(parts.join('/'));
          }
        } catch {
          resolved.push(addr);
        }
      }
    } else {
      resolved.push(addr);
    }
  }
  return resolved;
}

/** Send ETH from Anvil's pre-funded account to an address */
async function fundAddress(to, valueHex) {
  const resp = await fetch(EVM_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_sendTransaction',
      params: [{ from: FUNDER, to, value: valueHex }],
    }),
  });
  const json = await resp.json();
  if (json.error) throw new Error(`Funding failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function main() {
  console.log('[away] Booting kernel...');
  const db = await makeSQLKernelDatabase({ dbFilename: ':memory:' });
  const kernel = await Kernel.make(new NodejsPlatformServices({}), db, {
    resetStorage: true,
  });
  await kernel.initIdentity();

  console.log('[away] Starting RPC socket server...');
  await startRpcSocketServer({ socketPath: SOCKET_PATH, kernel, kernelDatabase: db });
  console.log(`[away] Socket: ${SOCKET_PATH}`);

  console.log('[away] Initializing QUIC transport...');
  await kernel.initRemoteComms({
    directListenAddresses: [QUIC_LISTEN_ADDRESS],
  });

  // Wait for connected state
  let status = await kernel.getStatus();
  const connDeadline = Date.now() + 30_000;
  while (status.remoteComms?.state !== 'connected' && Date.now() < connDeadline) {
    await new Promise((r) => setTimeout(r, 500));
    status = await kernel.getStatus();
  }
  if (status.remoteComms?.state !== 'connected') {
    console.error('[away] FATAL: Remote comms failed to connect');
    process.exit(1);
  }
  console.log(`[away] Peer ID: ${status.remoteComms.peerId.slice(0, 16)}...`);

  console.log('[away] Waiting for home kernel info...');
  const homeInfo = await waitForFile(HOME_INFO_PATH);
  console.log(`[away] Home peer: ${homeInfo.peerId.slice(0, 16)}...`);

  // Register location hints with resolved IPs
  const resolvedAddresses = await resolveQuicAddresses(homeInfo.quicAddresses);
  console.log(`[away] Resolved home addresses: ${resolvedAddresses.join(', ')}`);
  await kernel.registerLocationHints(homeInfo.peerId, resolvedAddresses);

  // Read deployed contract addresses (written by deploy-contracts.mjs)
  const contracts = await waitForFile(CONTRACTS_PATH);
  console.log(`[away] DelegationManager: ${contracts.DelegationManager}`);

  console.log('[away] Launching wallet subcluster...');
  const walletConfig = makeWalletClusterConfig({
    bundleBaseUrl: BUNDLE_BASE_URL,
    allowedHosts: ['evm:8545', 'bundler:4337'],
    delegationManagerAddress: contracts.DelegationManager,
  });
  const { rootKref } = await kernel.launchSubcluster(walletConfig);
  await waitUntilQuiescent();
  console.log(`[away] Coordinator: ${rootKref}`);

  console.log('[away] Initializing throwaway keyring...');
  const entropy = `0x${randomBytes(32).toString('hex')}`;
  const keyResult = await kernel.queueMessage(rootKref, 'initializeKeyring', [
    { type: 'throwaway', entropy },
  ]);
  await waitUntilQuiescent();
  kunser(keyResult);

  // Get the throwaway EOA address
  const acctResult = await kernel.queueMessage(rootKref, 'getAccounts', []);
  await waitUntilQuiescent();
  const accounts = kunser(acctResult);
  const throwawayAddress = accounts[0];
  console.log(`[away] Throwaway EOA: ${throwawayAddress}`);

  // DELEGATION_MODE controls how delegation redemption works:
  //   bundler-7702 (default) — away has bundler + 7702 smart account
  //   bundler-hybrid         — away has bundler + factory-deployed HybridDeleGator
  //   peer-relay             — away has no bundler, relays to home via CapTP
  const delegationMode = process.env.DELEGATION_MODE || 'bundler-7702';
  console.log(`[away] Delegation mode: ${delegationMode}`);

  console.log('[away] Configuring provider (Anvil)...');
  const provResult = await kernel.queueMessage(rootKref, 'configureProvider', [
    { chainId: 31337, rpcUrl: EVM_RPC },
  ]);
  await waitUntilQuiescent();
  kunser(provResult);

  console.log('[away] Connecting to home peer via OCAP URL...');
  const connectResult = await kernel.queueMessage(rootKref, 'connectToPeer', [
    homeInfo.ocapUrl,
  ]);
  await waitUntilQuiescent();
  kunser(connectResult);
  console.log('[away] Peer connection established.');

  let smartAccountAddress;
  if (delegationMode === 'bundler-7702') {
    // Fund the throwaway EOA — needs ETH for the 7702 auth tx and UserOp gas
    console.log('[away] Funding throwaway EOA...');
    const fundTx = await fundAddress(throwawayAddress, '0x8AC7230489E80000'); // 10 ETH
    console.log(`[away] Funded: ${fundTx}`);

    console.log('[away] Configuring bundler...');
    const bundlerResult = await kernel.queueMessage(rootKref, 'configureBundler', [
      { bundlerUrl: BUNDLER_URL, chainId: 31337, entryPoint: contracts.EntryPoint, environment: contracts },
    ]);
    await waitUntilQuiescent();
    kunser(bundlerResult);

    // Promote throwaway EOA to Stateless7702 DeleGator smart account.
    console.log('[away] Creating stateless7702 smart account...');
    const saResult = await kernel.queueMessage(rootKref, 'createSmartAccount', [
      { chainId: 31337, implementation: 'stateless7702' },
    ]);
    await waitUntilQuiescent();
    const saConfig = kunser(saResult);
    smartAccountAddress = saConfig.address;
    console.log(`[away] Smart account (7702): ${saConfig.address}`);
  } else if (delegationMode === 'bundler-hybrid') {
    console.log('[away] Configuring bundler...');
    const bundlerResult = await kernel.queueMessage(rootKref, 'configureBundler', [
      { bundlerUrl: BUNDLER_URL, chainId: 31337, entryPoint: contracts.EntryPoint, environment: contracts },
    ]);
    await waitUntilQuiescent();
    kunser(bundlerResult);

    // Create HybridDeleGator (factory-deployed smart account)
    console.log('[away] Creating hybrid smart account...');
    const saResult = await kernel.queueMessage(rootKref, 'createSmartAccount', [
      { chainId: 31337 },
    ]);
    await waitUntilQuiescent();
    const saConfig = kunser(saResult);
    console.log(`[away] Smart account (hybrid): ${saConfig.address}`);

    // Pre-deploy on-chain via factory call + fund for UserOp gas
    if (saConfig.factory && saConfig.factoryData) {
      console.log('[away] Pre-deploying smart account via factory...');
      const deployResp = await fetch(EVM_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'eth_sendTransaction',
          params: [{ from: FUNDER, to: saConfig.factory, data: saConfig.factoryData, gas: '0x1000000' }],
        }),
      });
      const deployJson = await deployResp.json();
      if (deployJson.error) {
        console.error('[away] Factory deploy failed:', deployJson.error);
      } else {
        console.log(`[away] Factory deploy tx: ${deployJson.result}`);
      }
      await fundAddress(saConfig.address, '0x8AC7230489E80000'); // 10 ETH
      console.log('[away] Funded smart account with 10 ETH');
    }
    smartAccountAddress = saConfig.address;
  } else {
    console.log('[away] peer-relay mode — skipping bundler + smart account setup');
  }

  // Get capabilities
  const capsResult = await kernel.queueMessage(rootKref, 'getCapabilities', []);
  await waitUntilQuiescent();
  const caps = kunser(capsResult);
  const delegateAddress = caps.localAccounts?.[0] ?? 'unknown';

  const info = {
    coordinatorKref: rootKref,
    delegateAddress,
    delegationMode,
    hasBundlerConfig: caps.hasBundlerConfig ?? false,
    hasPeerWallet: caps.hasPeerWallet,
    ...(smartAccountAddress ? { smartAccountAddress } : {}),
  };
  writeFileSync(AWAY_INFO_PATH, JSON.stringify(info, null, 2));
  console.log(`[away] Info written to ${AWAY_INFO_PATH}`);
  console.log('[away] Ready. Waiting...');

  // Keep alive
  setInterval(() => {}, 60_000);
}

main().catch((error) => {
  console.error('[away] FATAL:', error);
  process.exit(1);
});
