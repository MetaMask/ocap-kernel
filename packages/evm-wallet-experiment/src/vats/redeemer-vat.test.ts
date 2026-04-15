import type { Baggage } from '@metamask/ocap-kernel';
import { describe, expect, it, vi } from 'vitest';

import type {
  TransferNativeGrant,
  TransferFungibleGrant,
  DelegationGrant,
  Address,
  Hex,
} from '../types.ts';
import { buildRootObject } from './redeemer-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';

vi.mock('@metamask/kernel-utils/exo', () => ({
  makeDefaultExo: (_name: string, methods: Record<string, unknown>) => methods,
}));

type RedeemerVat = {
  receiveGrant(grant: DelegationGrant): Promise<void>;
  removeGrant(id: string): Promise<void>;
  listGrants(): Promise<DelegationGrant[]>;
};

const NATIVE_GRANT: TransferNativeGrant = {
  method: 'transferNative',
  to: '0x2222222222222222222222222222222222222222' as Address,
  maxAmount: 1000n,
  delegation: {
    id: '0xaaaa',
    delegator: '0x1111111111111111111111111111111111111111' as Address,
    delegate: '0x2222222222222222222222222222222222222222' as Address,
    authority:
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
    caveats: [],
    salt: '0x01' as Hex,
    chainId: 1,
    status: 'pending' as const,
  },
};

const FUNGIBLE_GRANT: TransferFungibleGrant = {
  method: 'transferFungible',
  token: '0x3333333333333333333333333333333333333333' as Address,
  to: '0x4444444444444444444444444444444444444444' as Address,
  maxAmount: 5000n,
  delegation: {
    id: '0xbbbb',
    delegator: '0x1111111111111111111111111111111111111111' as Address,
    delegate: '0x2222222222222222222222222222222222222222' as Address,
    authority:
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
    caveats: [],
    salt: '0x02' as Hex,
    chainId: 1,
    status: 'pending' as const,
  },
};

function makeRoot() {
  const baggage = makeMockBaggage();
  const root = buildRootObject(
    undefined,
    undefined,
    baggage as unknown as Baggage,
  ) as unknown as RedeemerVat;
  return { root, baggage };
}

describe('redeemer-vat', () => {
  describe('listGrants', () => {
    it('returns empty array when no grants received', async () => {
      const { root } = makeRoot();
      const grants = await root.listGrants();
      expect(grants).toStrictEqual([]);
    });
  });

  describe('receiveGrant and listGrants', () => {
    it('stored grant appears in listGrants', async () => {
      const { root } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);
      const grants = await root.listGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0]).toStrictEqual(NATIVE_GRANT);
    });

    it('multiple grants all appear in listGrants', async () => {
      const { root } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);
      await root.receiveGrant(FUNGIBLE_GRANT);
      const grants = await root.listGrants();
      expect(grants).toHaveLength(2);
    });

    it('receiving the same grant id twice does not duplicate', async () => {
      const { root } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);
      await root.receiveGrant(NATIVE_GRANT);
      const grants = await root.listGrants();
      expect(grants).toHaveLength(1);
    });
  });

  describe('removeGrant', () => {
    it('removed grant no longer appears in listGrants', async () => {
      const { root } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);
      await root.removeGrant(NATIVE_GRANT.delegation.id);
      const grants = await root.listGrants();
      expect(grants).toStrictEqual([]);
    });

    it('removing one grant leaves others intact', async () => {
      const { root } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);
      await root.receiveGrant(FUNGIBLE_GRANT);
      await root.removeGrant(NATIVE_GRANT.delegation.id);
      const grants = await root.listGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0]).toStrictEqual(FUNGIBLE_GRANT);
    });
  });

  describe('baggage persistence', () => {
    it('restores grants after second buildRootObject call with same baggage', async () => {
      const { root, baggage } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);

      const restoredRoot = buildRootObject(
        undefined,
        undefined,
        baggage as unknown as Baggage,
      ) as unknown as RedeemerVat;
      const grants = await restoredRoot.listGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0]).toStrictEqual(NATIVE_GRANT);
    });

    it('restores multiple grants correctly', async () => {
      const { root, baggage } = makeRoot();
      await root.receiveGrant(NATIVE_GRANT);
      await root.receiveGrant(FUNGIBLE_GRANT);

      const restoredRoot = buildRootObject(
        undefined,
        undefined,
        baggage as unknown as Baggage,
      ) as unknown as RedeemerVat;
      const grants = await restoredRoot.listGrants();
      expect(grants).toHaveLength(2);
    });
  });
});
