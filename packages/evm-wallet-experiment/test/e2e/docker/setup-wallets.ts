/* eslint-disable n/no-process-env, n/no-process-exit */
/**
 * Host-side script to set up wallet subclusters on running Docker containers.
 *
 * Usage:
 *   yarn tsx test/e2e/docker/setup-wallets.ts [delegation-mode]
 *
 * Delegation modes: bundler-7702 (default), bundler-hybrid, peer-relay
 */

import { dockerKernelServicesForMode } from './helpers/docker-e2e-kernel-services.ts';
import type { DockerE2eKernelMode } from './helpers/docker-e2e-kernel-services.ts';
import { callVat, readContracts } from './helpers/docker-exec.ts';
import type { ContractAddresses } from './helpers/docker-exec.ts';
import {
  resolveOnChainDelegateAddress,
  setup7702Away,
  setupHome,
  setupHybridAway,
  setupPeerRelayAway,
} from './helpers/scenarios.ts';
import type {
  AwayResult,
  DockerKernelServicePair,
  HomeResult,
} from './helpers/scenarios.ts';

const mode = process.argv[2] ?? process.env.DELEGATION_MODE ?? 'bundler-7702';

type SetupAwayFn = (
  services: DockerKernelServicePair,
  contracts: ContractAddresses,
  home: HomeResult,
) => AwayResult | Promise<AwayResult>;

const awaySetupFns: Record<string, SetupAwayFn> = {
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

  const kernelServices = dockerKernelServicesForMode(mode);
  const contracts = readContracts();
  console.log(`Contracts: EntryPoint=${contracts.EntryPoint.slice(0, 10)}...`);

  const home = setupHome(kernelServices, contracts, {
    delegationMode: mode as DockerE2eKernelMode,
  });
  console.log(
    `Home (${kernelServices.home}): kref=${home.kref} SA=${home.smartAccountAddress.slice(0, 10)}...`,
  );

  const away = await setupAway(kernelServices, contracts, home);
  console.log(
    `Away (${kernelServices.away}): kref=${away.kref} delegate=${away.delegateAddress.slice(0, 10)}...`,
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

  const delegation = callVat(
    kernelServices.home,
    home.kref,
    'createDelegation',
    [{ delegate, caveats, chainId: 31337 }],
  );
  console.log(
    `Delegation created: ${(delegation as { id: string }).id.slice(0, 20)}...`,
  );

  callVat(kernelServices.away, away.kref, 'receiveDelegation', [delegation]);
  console.log('Delegation received by away.');

  console.log('Wallet setup complete.');
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
