import { describe, it, expect, beforeEach } from 'vitest';

import { buildRootObject } from './delegation-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import { encodeAllowedTargets, makeCaveat } from '../lib/caveats.ts';
import { finalizeDelegation, makeDelegation } from '../lib/delegation.ts';
import type { Address, Hex } from '../types.ts';

const ALICE = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address;
const BOB = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address;
const TARGET = '0x1234567890abcdef1234567890abcdef12345678' as Address;

describe('delegation-vat', () => {
  let baggage: ReturnType<typeof makeMockBaggage>;
  let root: ReturnType<typeof buildRootObject>;

  beforeEach(() => {
    baggage = makeMockBaggage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    root = buildRootObject({}, {}, baggage as any);
  });

  describe('bootstrap', () => {
    it('completes without error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await (root as any).bootstrap()).toBeUndefined();
    });
  });

  describe('createDelegation', () => {
    it('creates an unsigned delegation', async () => {
      const caveats = [
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET]),
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats,
        chainId: 1,
      });

      expect(delegation.delegator).toBe(ALICE);
      expect(delegation.delegate).toBe(BOB);
      expect(delegation.status).toBe('pending');
      expect(delegation.caveats).toHaveLength(1);
    });

    it('persists the delegation in baggage', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      expect(baggage.has('delegations')).toBe(true);
    });
  });

  describe('prepareDelegationForSigning', () => {
    it('returns EIP-712 typed data', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedData = await (root as any).prepareDelegationForSigning(
        delegation.id,
      );

      expect(typedData.primaryType).toBe('Delegation');
      expect(typedData.types).toHaveProperty('Delegation');
      expect(typedData.domain).toHaveProperty('chainId', 1);
    });

    it('throws for unknown delegation', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).prepareDelegationForSigning('nonexistent'),
      ).rejects.toThrow('Delegation not found');
    });
  });

  describe('storeSigned', () => {
    it('marks delegation as signed', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      const signature = '0xdeadbeef' as Hex;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).storeSigned(delegation.id, signature);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stored = await (root as any).getDelegation(delegation.id);
      expect(stored.status).toBe('signed');
      expect(stored.signature).toBe(signature);
    });
  });

  describe('receiveDelegation', () => {
    it('stores a signed delegation from a peer', async () => {
      const delegation = finalizeDelegation(
        makeDelegation({
          delegator: ALICE,
          delegate: BOB,
          caveats: [],
          chainId: 1,
        }),
        '0xdeadbeef' as Hex,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).receiveDelegation(delegation);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stored = await (root as any).getDelegation(delegation.id);
      expect(stored.status).toBe('signed');
    });

    it('rejects unsigned delegations', async () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).receiveDelegation(delegation),
      ).rejects.toThrow('Can only receive signed delegations');
    });
  });

  describe('findDelegationForAction', () => {
    it('finds a matching delegation', async () => {
      const caveats = [
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET]),
        }),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats,
        chainId: 1,
      });

      // Sign it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).storeSigned(delegation.id, '0xdeadbeef' as Hex);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = await (root as any).findDelegationForAction({
        to: TARGET,
      });

      expect(found).toBeDefined();
      expect(found.id).toBe(delegation.id);
    });

    it('returns undefined when no delegation matches', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = await (root as any).findDelegationForAction({
        to: TARGET,
      });

      expect(found).toBeUndefined();
    });
  });

  describe('listDelegations', () => {
    it('lists all delegations', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegations = await (root as any).listDelegations();
      expect(delegations).toHaveLength(2);
    });
  });

  describe('revokeDelegation', () => {
    it('marks a delegation as revoked', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).revokeDelegation(delegation.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const revoked = await (root as any).getDelegation(delegation.id);
      expect(revoked.status).toBe('revoked');
    });
  });
});
