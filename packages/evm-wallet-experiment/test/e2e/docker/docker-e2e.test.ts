/* eslint-disable n/no-process-env */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  callVat,
  evmRpc,
  isStackHealthy,
  readContracts,
} from './helpers/docker-exec.ts';
import type { ContractAddresses } from './helpers/docker-exec.ts';
import {
  setup7702Away,
  setupHome,
  setupHybridAway,
  setupPeerRelayAway,
} from './helpers/scenarios.ts';
import type { AwayResult, HomeResult } from './helpers/scenarios.ts';

const EXPECTED_HOME_ADDRESS = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
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

const DELEGATION_MODE = process.env.DELEGATION_MODE ?? 'bundler-7702';

const awaySetupFns: Record<
  string,
  (c: ContractAddresses, h: HomeResult) => AwayResult | Promise<AwayResult>
> = {
  'bundler-7702': setup7702Away,
  'bundler-hybrid': setupHybridAway,
  'peer-relay': setupPeerRelayAway,
};

describe('Docker E2E', () => {
  let homeResult: HomeResult;
  let awayResult: AwayResult;

  beforeAll(async () => {
    if (!isStackHealthy()) {
      throw new Error(
        'Docker stack is not running. Start it with: yarn docker:up',
      );
    }

    const contracts = readContracts();
    homeResult = setupHome(contracts);

    const setupAway = awaySetupFns[DELEGATION_MODE];
    if (!setupAway) {
      throw new Error(`Unknown DELEGATION_MODE: ${DELEGATION_MODE}`);
    }
    awayResult = await setupAway(contracts, homeResult);
  }, 180_000);

  const callHome = (method: string, args: unknown[] = []) =>
    callVat('home', homeResult.kref, method, args);

  const callAway = (method: string, args: unknown[] = []) =>
    callVat('away', awayResult.kref, method, args);

  // ---------------------------------------------------------------------------
  // Home wallet tests
  // ---------------------------------------------------------------------------

  describe('home wallet', () => {
    it('returns accounts', () => {
      const accounts = callHome('getAccounts') as string[];
      expect(accounts).toHaveLength(1);
      expect(accounts[0]?.toLowerCase()).toBe(EXPECTED_HOME_ADDRESS);
    });

    it('has balance from Anvil', async () => {
      const balanceHex = (await evmRpc('eth_getBalance', [
        EXPECTED_HOME_ADDRESS,
        'latest',
      ])) as string;
      const balanceEth = Number(BigInt(balanceHex)) / 1e18;
      expect(balanceEth).toBeGreaterThan(9000);
    });

    it('signs a message', () => {
      const signature = callHome('signMessage', ['Docker E2E test']) as string;
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
      const blockNum = callAway('request', ['eth_blockNumber', []]) as string;
      expect(blockNum).toMatch(/^0x[\da-f]+$/iu);
    });
  });

  // ---------------------------------------------------------------------------
  // Delegation redemption
  // ---------------------------------------------------------------------------

  describe('delegation redemption', () => {
    let delegation: Delegation;

    beforeAll(() => {
      const delegate =
        awayResult.smartAccountAddress ?? awayResult.delegateAddress;

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
        (await evmRpc('eth_getBalance', [BURN_ADDRESS, 'latest'])) as string,
      );

      const txHash = callAway('sendTransaction', [
        { from: homeSA, to: BURN_ADDRESS, value: '0xDE0B6B3A7640000' },
      ]) as string;

      expect(txHash).toMatch(/^0x[\da-f]{64}$/iu);

      const balanceAfter = BigInt(
        (await evmRpc('eth_getBalance', [BURN_ADDRESS, 'latest'])) as string,
      );
      expect(balanceAfter).toBeGreaterThan(balanceBefore);
    });

    it('reports capabilities consistent with delegation mode', () => {
      const caps = callAway('getCapabilities') as Capabilities;

      expect(caps.delegationCount).toBeGreaterThanOrEqual(1);

      const expectations: Record<string, () => void> = {
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

      expectations[DELEGATION_MODE]?.();
    });
  });
});
