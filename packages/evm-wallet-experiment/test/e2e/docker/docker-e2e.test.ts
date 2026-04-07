/* eslint-disable n/no-process-env */
import { mnemonicToAccount } from 'viem/accounts';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  DOCKER_E2E_KERNEL_MODES,
  dockerE2eHomeSrpAddressIndex,
  dockerKernelServicesForMode,
} from './helpers/docker-e2e-kernel-services.ts';
import type {
  DockerE2eKernelMode,
  DockerKernelServicePair,
} from './helpers/docker-e2e-kernel-services.ts';
import {
  callVat,
  evmRpc,
  isStackHealthy,
  readContracts,
} from './helpers/docker-exec.ts';
import type { ContractAddresses } from './helpers/docker-exec.ts';
import {
  resolveOnChainDelegateAddress,
  setup7702Away,
  setupHome,
  setupHybridAway,
  setupPeerRelayAway,
} from './helpers/scenarios.ts';
import type { AwayResult, HomeResult } from './helpers/scenarios.ts';

const DOCKER_E2E_TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

function expectedDockerHomeEoaAddress(mode: DockerE2eKernelMode): string {
  return mnemonicToAccount(DOCKER_E2E_TEST_MNEMONIC, {
    addressIndex: dockerE2eHomeSrpAddressIndex(mode),
  }).address.toLowerCase();
}

/**
 * All parallel-safe modes by default. Set `DELEGATION_MODE` to run one only.
 *
 * @returns Modes to execute in this Vitest run.
 */
function dockerE2eDelegationModes(): DockerE2eKernelMode[] {
  const only = process.env.DELEGATION_MODE;
  if (only !== undefined && only.length > 0) {
    dockerKernelServicesForMode(only);
    return [only as DockerE2eKernelMode];
  }
  return [...DOCKER_E2E_KERNEL_MODES];
}
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';

type Delegation = {
  id: string;
  delegate: string;
  delegator: string;
  status: string;
};

type Capabilities = {
  hasLocalKeys: boolean;
  hasPeerWallet: boolean;
  hasBundlerConfig: boolean;
  delegationCount: number;
  smartAccountAddress?: string;
  localAccounts?: string[];
  autonomy?: string;
};

type CallAwayFn = (
  method: string,
  args?: unknown[],
  opts?: { daemonTimeoutSeconds?: number },
) => unknown;

/**
 * Hybrid redeems via ERC-4337; sendTransaction returns a UserOp hash. Other
 * modes return a mined tx hash (7702 direct) or equivalent without UserOp polling.
 *
 * @param mode - `DELEGATION_MODE` value.
 * @param submitHash - Return value from `sendTransaction` (UserOp hash for hybrid).
 * @param callAway - Away coordinator `callVat` wrapper.
 */
function awaitSendIncludedOnChain(
  mode: string,
  submitHash: string,
  callAway: CallAwayFn,
): void {
  if (mode !== 'bundler-hybrid') {
    return;
  }
  callAway(
    'waitForUserOpReceipt',
    [
      {
        userOpHash: submitHash,
        pollIntervalMs: 500,
        timeoutMs: 120_000,
      },
    ],
    { daemonTimeoutSeconds: 150 },
  );
}

const awaySetupFns: Record<
  string,
  (
    services: DockerKernelServicePair,
    c: ContractAddresses,
    h: HomeResult,
  ) => AwayResult | Promise<AwayResult>
> = {
  'bundler-7702': setup7702Away,
  'bundler-hybrid': setupHybridAway,
  'peer-relay': setupPeerRelayAway,
};

describe('Docker E2E', () => {
  beforeAll(() => {
    if (!isStackHealthy()) {
      throw new Error(
        'Docker stack is not running. Start it with: yarn docker:up',
      );
    }
  });

  describe.each(dockerE2eDelegationModes())(
    'DELEGATION_MODE %s',
    (delegationMode) => {
      let kernelServices!: DockerKernelServicePair;
      let homeResult: HomeResult;
      let awayResult: AwayResult;

      beforeAll(async () => {
        kernelServices = dockerKernelServicesForMode(delegationMode);
        const contracts = readContracts();
        homeResult = setupHome(kernelServices, contracts, {
          delegationMode,
        });

        const setupAway = awaySetupFns[delegationMode];
        if (!setupAway) {
          throw new Error(`Unknown DELEGATION_MODE: ${delegationMode}`);
        }
        awayResult = await setupAway(kernelServices, contracts, homeResult);
      }, 180_000);

      const callHome = (
        method: string,
        args: unknown[] = [],
        opts?: { daemonTimeoutSeconds?: number },
      ) => callVat(kernelServices.home, homeResult.kref, method, args, opts);

      const callAway = (
        method: string,
        args: unknown[] = [],
        opts?: { daemonTimeoutSeconds?: number },
      ) => callVat(kernelServices.away, awayResult.kref, method, args, opts);

      // ---------------------------------------------------------------------------
      // Home wallet tests
      // ---------------------------------------------------------------------------

      describe('home wallet', () => {
        const expectedHomeAddress =
          expectedDockerHomeEoaAddress(delegationMode);

        it('returns accounts', () => {
          const accounts = callHome('getAccounts') as string[];
          expect(accounts).toHaveLength(1);
          expect(accounts[0]?.toLowerCase()).toBe(expectedHomeAddress);
        });

        it('has balance from Anvil', async () => {
          const balanceHex = (await evmRpc('eth_getBalance', [
            expectedHomeAddress,
            'latest',
          ])) as string;
          const balanceEth = Number(BigInt(balanceHex)) / 1e18;
          expect(balanceEth).toBeGreaterThan(9000);
        });

        it('signs a message', () => {
          const signature = callHome('signMessage', [
            'Docker E2E test',
          ]) as string;
          expect(signature).toMatch(/^0x[\da-f]{130}$/iu);
        });

        it('signs typed data (EIP-712)', () => {
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
              ],
            },
            primaryType: 'Mail',
            message: { from: 'Alice', to: 'Bob' },
          };
          const signature = callHome('signTypedData', [typedData]) as string;
          expect(signature).toMatch(/^0x[\da-f]{130}$/iu);
        });

        it('queries eth_blockNumber', async () => {
          const blockNum = (await evmRpc('eth_blockNumber')) as string;
          expect(blockNum).toMatch(/^0x[\da-f]+$/iu);
        });
      });

      // ---------------------------------------------------------------------------
      // away wallet tests
      // ---------------------------------------------------------------------------

      describe('away wallet', () => {
        it('has local keys', () => {
          const caps = callAway('getCapabilities') as Capabilities;
          expect(caps.hasLocalKeys).toBe(true);
        });

        it('signs a message', () => {
          const signature = callAway('signMessage', ['Away test']) as string;
          expect(signature).toMatch(/^0x[\da-f]{130}$/iu);
        });

        it('queries eth_blockNumber', () => {
          const blockNum = callAway('request', [
            'eth_blockNumber',
            [],
          ]) as string;
          expect(blockNum).toMatch(/^0x[\da-f]+$/iu);
        });
      });

      // ---------------------------------------------------------------------------
      // Delegation redemption
      // ---------------------------------------------------------------------------

      describe('delegation redemption', () => {
        let delegation: Delegation;

        beforeAll(() => {
          const delegate = resolveOnChainDelegateAddress({
            delegationMode,
            home: homeResult,
            away: awayResult,
          });

          delegation = callHome('createDelegation', [
            { delegate, caveats: [], chainId: 31337 },
          ]) as Delegation;

          callAway('receiveDelegation', [delegation]);
        });

        it('creates a signed delegation', () => {
          expect(delegation.status).toBe('signed');
        });

        it('lists delegation on away', () => {
          const delegations = callAway('listDelegations') as Delegation[];
          expect(delegations.length).toBeGreaterThanOrEqual(1);
          expect(delegations[0]?.id).toBe(delegation.id);
        });

        it('sends ETH via delegated authority', async () => {
          const homeSA = homeResult.smartAccountAddress;
          expect(homeSA).toBeDefined();

          const balanceBefore = BigInt(
            (await evmRpc('eth_getBalance', [
              BURN_ADDRESS,
              'latest',
            ])) as string,
          );

          const submitHash = callAway('sendTransaction', [
            { from: homeSA, to: BURN_ADDRESS, value: '0xDE0B6B3A7640000' },
          ]) as string;

          expect(submitHash).toMatch(/^0x[\da-f]{64}$/iu);

          awaitSendIncludedOnChain(delegationMode, submitHash, callAway);

          const balanceAfter = BigInt(
            (await evmRpc('eth_getBalance', [
              BURN_ADDRESS,
              'latest',
            ])) as string,
          );
          expect(balanceAfter).toBeGreaterThan(balanceBefore);
        });

        it('reports capabilities consistent with delegation mode', () => {
          const caps = callAway('getCapabilities') as Capabilities;

          expect(caps.delegationCount).toBeGreaterThanOrEqual(1);

          const expectations: Record<DockerE2eKernelMode, () => void> = {
            'bundler-7702': () => {
              expect(caps.hasBundlerConfig).toBe(true);
              expect(caps.smartAccountAddress).toBeDefined();
            },
            'bundler-hybrid': () => {
              expect(caps.hasBundlerConfig).toBe(true);
              expect(caps.smartAccountAddress).toBeDefined();
            },
            'peer-relay': () => {
              expect(caps.hasBundlerConfig).toBe(false);
              expect(caps.hasPeerWallet).toBe(true);
            },
          };

          expectations[delegationMode]();
        });
      });
    },
  );
});
