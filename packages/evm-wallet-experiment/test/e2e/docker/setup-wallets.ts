/* eslint-disable n/no-process-env, n/no-process-exit */
/**
 * Host-side script to set up wallet subclusters on running Docker containers.
 *
 * Usage:
 *   yarn tsx test/e2e/docker/setup-wallets.ts [delegation-mode]
 *
 * Delegation modes: bundler-7702 (default), bundler-hybrid, peer-relay
 */

import { callVat, readContracts } from './helpers/docker-exec.ts';
import {
  resolveOnChainDelegateAddress,
  setup7702Away,
  setupHome,
  setupHybridAway,
  setupPeerRelayAway,
} from './helpers/scenarios.ts';
import type { AwayResult } from './helpers/scenarios.ts';

const mode = process.argv[2] ?? process.env.DELEGATION_MODE ?? 'bundler-7702';

const awaySetupFns: Record<
  string,
  (
    ...args: Parameters<typeof setup7702Away>
  ) => AwayResult | Promise<AwayResult>
> = {
  'bundler-7702': setup7702Away,
  'bundler-hybrid': setupHybridAway,
  'peer-relay': setupPeerRelayAway,
};

async function main() {
  const setupAway = awaySetupFns[mode];
  if (!setupAway) {
    console.error(`Unknown delegation mode: ${mode}`);
    console.error('Valid modes: bundler-7702, bundler-hybrid, peer-relay');
    process.exit(1);
  }

  console.log(`Setting up wallets (mode: ${mode})...`);

  const contracts = readContracts();
  console.log(`Contracts: EntryPoint=${contracts.EntryPoint.slice(0, 10)}...`);

  const home = setupHome(contracts);
  console.log(
    `Home: kref=${home.kref} SA=${home.smartAccountAddress.slice(0, 10)}...`,
  );

  const away = await setupAway(contracts, home);
  console.log(
    `Away: kref=${away.kref} delegate=${away.delegateAddress.slice(0, 10)}...`,
  );
  if (away.smartAccountAddress) {
    console.log(`Away SA: ${away.smartAccountAddress}`);
  }

  const delegate = resolveOnChainDelegateAddress({
    delegationMode: mode,
    home,
    away,
  });
  console.log(
    mode === 'peer-relay'
      ? `Creating delegation: on-chain delegate = home (${delegate.slice(0, 10)}...) for peer-relay redeem`
      : `Creating delegation: home → away delegate ${delegate.slice(0, 10)}...`,
  );

  // 1000 ETH max spend caveat via the deployed NativeTokenTransferAmountEnforcer
  const maxSpendWei = 1000n * 10n ** 18n;
  const caveats = [
    {
      type: 'nativeTokenTransferAmount',
      enforcer: contracts.caveatEnforcers.NativeTokenTransferAmountEnforcer,
      terms: `0x${maxSpendWei.toString(16).padStart(64, '0')}`,
    },
  ];
  console.log('Caveat: nativeTokenTransferAmount <= 1000 ETH');

  const delegation = callVat('home', home.kref, 'createDelegation', [
    { delegate, caveats, chainId: 31337 },
  ]);
  console.log(
    `Delegation created: ${(delegation as { id: string }).id.slice(0, 20)}...`,
  );

  callVat('away', away.kref, 'receiveDelegation', [delegation]);
  console.log('Delegation received by away.');

  console.log('Wallet setup complete.');
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
