import { describe, it, expect } from 'vitest';

import {
  encodeAllowedTargets,
  encodeAllowedMethods,
  encodeValueLte,
  encodeTimestamp,
  encodeErc20TransferAmount,
  encodeLimitedCalls,
  makeCaveat,
} from './caveats.ts';
import {
  computeDelegationId,
  makeDelegation,
  prepareDelegationTypedData,
  delegationMatchesAction,
  explainDelegationMatch,
  finalizeDelegation,
  generateSalt,
} from './delegation.ts';
import type { Address, Delegation, Hex } from '../types.ts';

const ALICE = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address;
const BOB = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address;
const TARGET_CONTRACT = '0x1234567890abcdef1234567890abcdef12345678' as Address;
const DELEGATION_MANAGER =
  '0xcccccccccccccccccccccccccccccccccccccccc' as Address;

describe('lib/delegation', () => {
  describe('generateSalt', () => {
    it('generates a 32-byte hex salt', () => {
      const salt = generateSalt();
      expect(salt).toMatch(/^0x[\da-f]{64}$/iu);
    });

    it('generates unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('computeDelegationId', () => {
    it('produces a deterministic hash', () => {
      const params = {
        delegator: ALICE,
        delegate: BOB,
        authority:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
      };

      const id1 = computeDelegationId(params);
      const id2 = computeDelegationId(params);
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different salts', () => {
      const base = {
        delegator: ALICE,
        delegate: BOB,
        authority:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as Hex,
      };

      const id1 = computeDelegationId({
        ...base,
        salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
      });
      const id2 = computeDelegationId({
        ...base,
        salt: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
      });
      expect(id1).not.toBe(id2);
    });
  });

  describe('makeDelegation', () => {
    it('creates an unsigned delegation with pending status', () => {
      const caveats = [
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET_CONTRACT]),
        }),
      ];

      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats,
        chainId: 1,
      });

      expect(delegation).toStrictEqual({
        id: expect.stringMatching(/^0x/u),
        delegator: ALICE,
        delegate: BOB,
        authority:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        caveats,
        salt: expect.stringMatching(/^0x/u),
        chainId: 1,
        status: 'pending',
      });
    });

    it('uses a provided salt', () => {
      const salt =
        '0x0000000000000000000000000000000000000000000000000000000000000042' as Hex;

      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
        salt,
      });

      expect(delegation.salt).toBe(salt);
    });

    it('uses a provided authority', () => {
      const authority =
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;

      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
        authority,
      });

      expect(delegation.authority).toBe(authority);
    });
  });

  describe('prepareDelegationTypedData', () => {
    it('builds EIP-712 typed data for signing', () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      const typedData = prepareDelegationTypedData({
        delegation,
        verifyingContract: DELEGATION_MANAGER,
      });

      expect(typedData.domain).toStrictEqual({
        name: 'DelegationManager',
        version: '1',
        chainId: 1,
        verifyingContract: DELEGATION_MANAGER,
      });

      expect(typedData.primaryType).toBe('Delegation');
      expect(typedData.types).toHaveProperty('Delegation');
      expect(typedData.types).toHaveProperty('Caveat');
      expect(typedData.message).toHaveProperty('delegate', BOB);
      expect(typedData.message).toHaveProperty('delegator', ALICE);
    });
  });

  describe('delegationMatchesAction', () => {
    const makeSignedDelegation = (caveats: Delegation['caveats']): Delegation =>
      finalizeDelegation(
        makeDelegation({
          delegator: ALICE,
          delegate: BOB,
          caveats,
          chainId: 1,
        }),
        '0xdeadbeef' as Hex,
      );

    it('does not match unsigned delegations', () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      expect(delegationMatchesAction(delegation, { to: TARGET_CONTRACT })).toBe(
        false,
      );
    });

    it('matches a signed delegation with no caveats', () => {
      const delegation = makeSignedDelegation([]);

      expect(delegationMatchesAction(delegation, { to: TARGET_CONTRACT })).toBe(
        true,
      );
    });

    it('matches when target is in allowedTargets', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET_CONTRACT]),
        }),
      ]);

      expect(delegationMatchesAction(delegation, { to: TARGET_CONTRACT })).toBe(
        true,
      );
    });

    it('does not match when target is not in allowedTargets', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET_CONTRACT]),
        }),
      ]);

      expect(
        delegationMatchesAction(delegation, {
          to: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address,
        }),
      ).toBe(false);
    });

    it('matches when method selector is in allowedMethods', () => {
      const transferSelector = '0xa9059cbb' as Hex;
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'allowedMethods',
          terms: encodeAllowedMethods([transferSelector]),
        }),
      ]);

      expect(
        delegationMatchesAction(delegation, {
          to: TARGET_CONTRACT,
          data: '0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        }),
      ).toBe(true);
    });

    it('does not match when method selector is not in allowedMethods', () => {
      const transferSelector = '0xa9059cbb' as Hex;
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'allowedMethods',
          terms: encodeAllowedMethods([transferSelector]),
        }),
      ]);

      expect(
        delegationMatchesAction(delegation, {
          to: TARGET_CONTRACT,
          data: '0x12345678' as Hex,
        }),
      ).toBe(false);
    });

    it('matches when value is within valueLte limit', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'valueLte',
          terms: encodeValueLte(1000000000000000000n), // 1 ETH
        }),
      ]);

      expect(
        delegationMatchesAction(delegation, {
          to: TARGET_CONTRACT,
          value: '0x0de0b6b3a7640000' as Hex, // 1 ETH
        }),
      ).toBe(true);
    });

    it('does not match when value exceeds valueLte limit', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'valueLte',
          terms: encodeValueLte(1000000000000000000n), // 1 ETH
        }),
      ]);

      expect(
        delegationMatchesAction(delegation, {
          to: TARGET_CONTRACT,
          value: '0x1bc16d674ec80000' as Hex, // 2 ETH
        }),
      ).toBe(false);
    });

    it('matches valueLte when action has no value', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'valueLte',
          terms: encodeValueLte(1000000000000000000n),
        }),
      ]);

      expect(delegationMatchesAction(delegation, { to: TARGET_CONTRACT })).toBe(
        true,
      );
    });

    it('matches when within timestamp window', () => {
      const now = Math.floor(Date.now() / 1000);
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'timestamp',
          terms: encodeTimestamp({
            after: now - 3600,
            before: now + 3600,
          }),
        }),
      ]);

      expect(delegationMatchesAction(delegation, { to: TARGET_CONTRACT })).toBe(
        true,
      );
    });

    it('does not match when timestamp window has expired', () => {
      const now = Math.floor(Date.now() / 1000);
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'timestamp',
          terms: encodeTimestamp({
            after: now - 7200,
            before: now - 3600,
          }),
        }),
      ]);

      expect(delegationMatchesAction(delegation, { to: TARGET_CONTRACT })).toBe(
        false,
      );
    });

    describe('erc20TransferAmount caveat', () => {
      const TOKEN = '0xdead000000000000000000000000000000000000' as Address;
      const MAX_AMOUNT = 1000000n; // 1 USDC (6 decimals)

      const makeErc20Delegation = () =>
        makeSignedDelegation([
          makeCaveat({
            type: 'erc20TransferAmount',
            terms: encodeErc20TransferAmount({
              token: TOKEN,
              amount: MAX_AMOUNT,
            }),
          }),
        ]);

      // ERC-20 transfer(address,uint256) calldata helper
      const makeTransferCalldata = (to: Address, amount: bigint): Hex => {
        const selector = 'a9059cbb';
        const toParam = to.slice(2).toLowerCase().padStart(64, '0');
        const amountParam = amount.toString(16).padStart(64, '0');
        return `0x${selector}${toParam}${amountParam}` as Hex;
      };

      it('matches valid ERC-20 transfer within limit', () => {
        const delegation = makeErc20Delegation();
        const result = delegationMatchesAction(delegation, {
          to: TOKEN,
          data: makeTransferCalldata(BOB, 500000n),
        });
        expect(result).toBe(true);
      });

      it('matches when transfer amount equals limit', () => {
        const delegation = makeErc20Delegation();
        const result = delegationMatchesAction(delegation, {
          to: TOKEN,
          data: makeTransferCalldata(BOB, MAX_AMOUNT),
        });
        expect(result).toBe(true);
      });

      it('does not match when transfer amount exceeds limit', () => {
        const delegation = makeErc20Delegation();
        const result = delegationMatchesAction(delegation, {
          to: TOKEN,
          data: makeTransferCalldata(BOB, MAX_AMOUNT + 1n),
        });
        expect(result).toBe(false);
      });

      it('does not match when target is wrong token', () => {
        const delegation = makeErc20Delegation();
        const result = delegationMatchesAction(delegation, {
          to: TARGET_CONTRACT, // wrong token
          data: makeTransferCalldata(BOB, 500000n),
        });
        expect(result).toBe(false);
      });

      it('does not match when calldata is not a transfer', () => {
        const delegation = makeErc20Delegation();
        const result = delegationMatchesAction(delegation, {
          to: TOKEN,
          data: '0x12345678' as Hex, // wrong selector
        });
        expect(result).toBe(false);
      });

      it('does not match when calldata is missing', () => {
        const delegation = makeErc20Delegation();
        const result = delegationMatchesAction(delegation, {
          to: TOKEN,
        });
        expect(result).toBe(false);
      });
    });

    describe('limitedCalls caveat', () => {
      it('always matches (client-side passthrough)', () => {
        const delegation = makeSignedDelegation([
          makeCaveat({
            type: 'limitedCalls',
            terms: encodeLimitedCalls(5),
          }),
        ]);

        expect(
          delegationMatchesAction(delegation, { to: TARGET_CONTRACT }),
        ).toBe(true);
      });
    });
  });

  describe('explainDelegationMatch', () => {
    const makeSignedDelegation = (caveats: Delegation['caveats']): Delegation =>
      finalizeDelegation(
        makeDelegation({
          delegator: ALICE,
          delegate: BOB,
          caveats,
          chainId: 1,
        }),
        '0xdeadbeef' as Hex,
      );

    it('returns matches: true for a matching delegation', () => {
      const delegation = makeSignedDelegation([]);
      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
      });
      expect(result).toStrictEqual({ matches: true });
    });

    it('returns reason when delegation is not signed', () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
      });
      expect(result.matches).toBe(false);
      expect(result.reason).toBe('Delegation is not signed');
      expect(result.failedCaveat).toBeUndefined();
    });

    it('reports allowedTargets failure with target address', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([TARGET_CONTRACT]),
        }),
      ]);

      const wrongTarget =
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address;
      const result = explainDelegationMatch(delegation, { to: wrongTarget });
      expect(result).toStrictEqual({
        matches: false,
        failedCaveat: 'allowedTargets',
        reason: `Target ${wrongTarget} is not in the allowed targets list`,
      });
    });

    it('reports allowedMethods failure with selector', () => {
      const transferSelector = '0xa9059cbb' as Hex;
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'allowedMethods',
          terms: encodeAllowedMethods([transferSelector]),
        }),
      ]);

      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
        data: '0x12345678' as Hex,
      });
      expect(result).toStrictEqual({
        matches: false,
        failedCaveat: 'allowedMethods',
        reason: 'Method selector 0x12345678 is not in the allowed methods list',
      });
    });

    it('reports valueLte failure with amounts', () => {
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'valueLte',
          terms: encodeValueLte(1000000000000000000n), // 1 ETH
        }),
      ]);

      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
        value: '0x1bc16d674ec80000' as Hex, // 2 ETH
      });
      expect(result.matches).toBe(false);
      expect(result.failedCaveat).toBe('valueLte');
      expect(result.reason).toContain('exceeds maximum');
    });

    it('reports timestamp failure for expired window', () => {
      const now = Math.floor(Date.now() / 1000);
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'timestamp',
          terms: encodeTimestamp({
            after: now - 7200,
            before: now - 3600,
          }),
        }),
      ]);

      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
      });
      expect(result.matches).toBe(false);
      expect(result.failedCaveat).toBe('timestamp');
      expect(result.reason).toContain('after the allowed window');
    });

    it('reports timestamp failure for future window', () => {
      const now = Math.floor(Date.now() / 1000);
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'timestamp',
          terms: encodeTimestamp({
            after: now + 3600,
            before: now + 7200,
          }),
        }),
      ]);

      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
      });
      expect(result.matches).toBe(false);
      expect(result.failedCaveat).toBe('timestamp');
      expect(result.reason).toContain('before the allowed window');
    });

    it('reports erc20TransferAmount failure for wrong token', () => {
      const TOKEN = '0xdead000000000000000000000000000000000000' as Address;
      const delegation = makeSignedDelegation([
        makeCaveat({
          type: 'erc20TransferAmount',
          terms: encodeErc20TransferAmount({ token: TOKEN, amount: 1000000n }),
        }),
      ]);

      const result = explainDelegationMatch(delegation, {
        to: TARGET_CONTRACT,
        data: '0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001' as Hex,
      });
      expect(result.matches).toBe(false);
      expect(result.failedCaveat).toBe('erc20TransferAmount');
      expect(result.reason).toContain('does not match token contract');
    });
  });

  describe('finalizeDelegation', () => {
    it('marks a delegation as signed', () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });
      const signature = '0xdeadbeef' as Hex;

      const signed = finalizeDelegation(delegation, signature);

      expect(signed.status).toBe('signed');
      expect(signed.signature).toBe(signature);
      expect(signed.id).toBe(delegation.id);
    });

    it('does not mutate the original delegation', () => {
      const delegation = makeDelegation({
        delegator: ALICE,
        delegate: BOB,
        caveats: [],
        chainId: 1,
      });

      finalizeDelegation(delegation, '0xdeadbeef' as Hex);

      expect(delegation.status).toBe('pending');
      expect(delegation.signature).toBeUndefined();
    });
  });
});
