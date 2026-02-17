import { privateKeyToAccount } from 'viem/accounts';
import { describe, it, expect, beforeEach } from 'vitest';

import { buildRootObject } from './delegation-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import { DEFAULT_DELEGATION_MANAGER } from '../constants.ts';
import { encodeAllowedTargets, makeCaveat } from '../lib/caveats.ts';
import {
  finalizeDelegation,
  makeDelegation,
  prepareDelegationTypedData,
} from '../lib/delegation.ts';
import type { Address, Hex } from '../types.ts';

// Deterministic test key (DO NOT use in production)
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY);

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
    async function makeProperlySignedDelegation() {
      const unsigned = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });
      const typedData = prepareDelegationTypedData({
        delegation: unsigned,
        verifyingContract: DEFAULT_DELEGATION_MANAGER,
      });
      const signature = await TEST_ACCOUNT.signTypedData({
        domain: typedData.domain as Record<string, unknown>,
        types: typedData.types as Record<
          string,
          { name: string; type: string }[]
        >,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      return finalizeDelegation(unsigned, signature);
    }

    it('stores a signed delegation with valid signature', async () => {
      const delegation = await makeProperlySignedDelegation();

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

    it('rejects delegation with missing signature', async () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });
      // Force status to 'signed' but without a signature
      const noSig = { ...delegation, status: 'signed' as const };

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).receiveDelegation(noSig),
      ).rejects.toThrow('Delegation has no signature');
    });

    it('rejects delegation with mismatched ID', async () => {
      const delegation = await makeProperlySignedDelegation();
      const tampered = { ...delegation, id: '0xbadid' };

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).receiveDelegation(tampered),
      ).rejects.toThrow('Delegation ID mismatch');
    });

    it('rejects delegation with invalid signature', async () => {
      const unsigned = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });
      // Valid format (65 bytes, v=27) but garbage r/s values
      const fakeSig = `0x${'ab'.repeat(32)}${'cd'.repeat(32)}1b`;
      const signed = finalizeDelegation(unsigned, fakeSig as Hex);

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).receiveDelegation(signed),
      ).rejects.toThrow('Invalid delegation signature');
    });

    it('rejects delegation signed by wrong account', async () => {
      // Create delegation claiming ALICE is delegator, but sign with a different key
      const otherKey =
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
      const otherAccount = privateKeyToAccount(otherKey as `0x${string}`);

      const unsigned = makeDelegation({
        delegator: ALICE, // claims ALICE is delegator
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });
      const typedData = prepareDelegationTypedData({
        delegation: unsigned,
        verifyingContract: DEFAULT_DELEGATION_MANAGER,
      });
      // Sign with otherAccount (not ALICE)
      const signature = await otherAccount.signTypedData({
        domain: typedData.domain as Record<string, unknown>,
        types: typedData.types as Record<
          string,
          { name: string; type: string }[]
        >,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      const tampered = finalizeDelegation(unsigned, signature);

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).receiveDelegation(tampered),
      ).rejects.toThrow('Invalid delegation signature');
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

    it('filters by chainId when provided', async () => {
      // Create delegation on chain 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).storeSigned(delegation.id, '0xdeadbeef' as Hex);

      // Should find on chain 1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = await (root as any).findDelegationForAction(
        { to: TARGET },
        1,
      );
      expect(found).toBeDefined();
      expect(found.id).toBe(delegation.id);

      // Should NOT find on chain 42
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notFound = await (root as any).findDelegationForAction(
        { to: TARGET },
        42,
      );
      expect(notFound).toBeUndefined();
    });

    it('returns all chains when chainId is omitted', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegation = await (root as any).createDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 137,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).storeSigned(delegation.id, '0xdeadbeef' as Hex);

      // No chainId filter — should still find it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = await (root as any).findDelegationForAction({
        to: TARGET,
      });
      expect(found).toBeDefined();
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
