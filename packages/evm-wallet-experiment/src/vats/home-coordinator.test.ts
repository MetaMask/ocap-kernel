import type { Baggage } from '@metamask/ocap-kernel';
import { describe, expect, it, vi } from 'vitest';

import type { Address, Delegation, DelegationGrant, Hex } from '../types.ts';
import { buildRootObject } from './home-coordinator.ts';
import { makeMockBaggage } from '../../test/helpers.ts';

vi.mock('@endo/eventual-send', () => ({
  E: (target: Record<string, (...args: unknown[]) => unknown>) =>
    new Proxy(target, {
      get(obj, prop: string) {
        return async (...args: unknown[]) =>
          Promise.resolve(obj[prop]?.(...args));
      },
    }),
}));
vi.mock('@metamask/kernel-utils/exo', () => ({
  makeDefaultExo: (_name: string, methods: Record<string, unknown>) => methods,
}));
vi.mock('@metamask/kernel-utils/discoverable', () => ({
  makeDiscoverableExo: (_name: string, methods: Record<string, unknown>) =>
    methods,
}));
vi.mock('../lib/sdk.ts', () => ({
  setSdkLogger: vi.fn(),
  registerEnvironment: vi.fn(),
  resolveEnvironment: vi.fn().mockReturnValue({ chainId: 11155111 }),
  getDelegationManagerAddress: vi
    .fn()
    .mockReturnValue('0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address),
  buildSdkRedeemCallData: vi.fn().mockReturnValue('0x' as Hex),
  buildSdkDisableCallData: vi.fn().mockReturnValue('0x' as Hex),
  buildBatchExecuteCallData: vi.fn().mockReturnValue('0x' as Hex),
  computeSmartAccountAddress: vi.fn(),
  isEip7702Delegated: vi.fn().mockResolvedValue(false),
  prepareUserOpTypedData: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type HomeCoordinator = {
  bootstrap(
    vats: Record<string, unknown>,
    services: Record<string, unknown>,
  ): Promise<void>;
  configureBundler(config: {
    bundlerUrl: string;
    chainId: number;
    usePaymaster?: boolean;
  }): Promise<void>;
  revokeGrant(id: string): Promise<Hex>;
};

const SIGNED_DELEGATION: Delegation = {
  id: '0xaaaa000000000000000000000000000000000000000000000000000000000000',
  delegator: '0x1111111111111111111111111111111111111111' as Address,
  delegate: '0x2222222222222222222222222222222222222222' as Address,
  authority:
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
  caveats: [],
  salt: '0x01' as Hex,
  chainId: 11155111,
  status: 'signed',
};

const REVOKED_DELEGATION: Delegation = {
  ...SIGNED_DELEGATION,
  id: '0xbbbb000000000000000000000000000000000000000000000000000000000000',
  status: 'revoked',
};

const NATIVE_GRANT: DelegationGrant = {
  method: 'transferNative',
  delegation: SIGNED_DELEGATION,
};

const REVOKED_GRANT: DelegationGrant = {
  method: 'transferNative',
  delegation: REVOKED_DELEGATION,
};

async function makeCoordinator(
  delegatorVat?: Record<string, unknown>,
): Promise<HomeCoordinator> {
  const baggage = makeMockBaggage();
  const coordinator = buildRootObject(
    {},
    undefined,
    baggage as unknown as Baggage,
  ) as unknown as HomeCoordinator;

  if (delegatorVat) {
    await coordinator.bootstrap({ delegator: delegatorVat }, {});
  }

  return coordinator;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('home-coordinator', () => {
  describe('configureBundler — URL validation', () => {
    it.each([
      'file:///etc/passwd',
      'ftp://host/path',
      'ws://host/path',
      '',
      'not-a-url',
    ])('rejects non-HTTP(S) URL: %s', async (bundlerUrl) => {
      const coordinator = await makeCoordinator();
      await expect(
        coordinator.configureBundler({ bundlerUrl, chainId: 1 }),
      ).rejects.toThrow('Invalid bundler URL');
    });

    it.each([0, -1, 1.5, NaN])(
      'rejects invalid chain ID: %s',
      async (chainId) => {
        const coordinator = await makeCoordinator();
        await expect(
          coordinator.configureBundler({
            bundlerUrl: 'https://api.pimlico.io/v2/sepolia/rpc?apikey=x',
            chainId,
          }),
        ).rejects.toThrow('Invalid chain ID');
      },
    );
  });

  describe('revokeGrant', () => {
    it('throws when grant is not found', async () => {
      const mockDelegator = { listGrants: vi.fn().mockResolvedValue([]) };
      const coordinator = await makeCoordinator(mockDelegator);

      await expect(
        coordinator.revokeGrant(SIGNED_DELEGATION.id),
      ).rejects.toThrow('not found');
    });

    it('throws when grant is already revoked', async () => {
      const mockDelegator = {
        listGrants: vi.fn().mockResolvedValue([REVOKED_GRANT]),
      };
      const coordinator = await makeCoordinator(mockDelegator);

      await expect(
        coordinator.revokeGrant(REVOKED_DELEGATION.id),
      ).rejects.toThrow('already revoked');
    });

    it('throws when delegatorVat is not available', async () => {
      const coordinator = await makeCoordinator();

      await expect(
        coordinator.revokeGrant(SIGNED_DELEGATION.id),
      ).rejects.toThrow('Delegator vat not available');
    });

    it('calls delegatorVat.listGrants to look up the grant', async () => {
      const mockDelegator = {
        listGrants: vi.fn().mockResolvedValue([NATIVE_GRANT]),
        removeGrant: vi.fn().mockResolvedValue(undefined),
      };
      const coordinator = await makeCoordinator(mockDelegator);

      // revokeGrant will fail past the lookup (no bundler/provider configured)
      // but listGrants must have been called once.
      await coordinator
        .revokeGrant(SIGNED_DELEGATION.id)
        .catch((_err) => undefined);
      expect(mockDelegator.listGrants).toHaveBeenCalledOnce();
    });
  });
});
