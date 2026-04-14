import { describe, expect, it } from 'vitest';

import type { Address } from '../types.ts';
import {
  buildDelegationGrant,
  makeDelegationGrantBuilder,
} from './delegation-grant.ts';
import { makeSaltGenerator } from './delegation.ts';

const ALICE = '0x1111111111111111111111111111111111111111' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const CHAIN_ID = 11155111;

describe('buildDelegationGrant', () => {
  describe('transfer', () => {
    it('produces correct caveats', () => {
      const grant = buildDelegationGrant('transfer', {
        delegator: ALICE,
        delegate: BOB,
        token: TOKEN,
        max: 1000n,
        chainId: CHAIN_ID,
      });

      expect(grant.methodName).toBe('transfer');
      expect(grant.token).toBe(TOKEN);
      expect(grant.delegation.delegator).toBe(ALICE);
      expect(grant.delegation.delegate).toBe(BOB);
      expect(grant.delegation.chainId).toBe(CHAIN_ID);
      expect(grant.delegation.status).toBe('pending');

      const caveatTypes = grant.delegation.caveats.map((cv) => cv.type);
      expect(caveatTypes).toStrictEqual([
        'allowedTargets',
        'allowedMethods',
        'erc20TransferAmount',
      ]);
    });

    it('includes timestamp caveat only when validUntil provided', () => {
      const withoutExpiry = buildDelegationGrant('transfer', {
        delegator: ALICE,
        delegate: BOB,
        token: TOKEN,
        max: 1000n,
        chainId: CHAIN_ID,
      });
      expect(
        withoutExpiry.delegation.caveats.map((cv) => cv.type),
      ).not.toContain('timestamp');

      const withExpiry = buildDelegationGrant('transfer', {
        delegator: ALICE,
        delegate: BOB,
        token: TOKEN,
        max: 1000n,
        chainId: CHAIN_ID,
        validUntil: 1700000000,
      });
      expect(withExpiry.delegation.caveats.map((cv) => cv.type)).toContain(
        'timestamp',
      );
    });

    it('caveatSpecs contain cumulativeSpend entry', () => {
      const grant = buildDelegationGrant('transfer', {
        delegator: ALICE,
        delegate: BOB,
        token: TOKEN,
        max: 500n,
        chainId: CHAIN_ID,
      });

      expect(grant.caveatSpecs).toStrictEqual([
        { type: 'cumulativeSpend', token: TOKEN, max: 500n },
      ]);
    });

    it('includes blockWindow caveatSpec when validUntil provided', () => {
      const grant = buildDelegationGrant('transfer', {
        delegator: ALICE,
        delegate: BOB,
        token: TOKEN,
        max: 500n,
        chainId: CHAIN_ID,
        validUntil: 1700000000,
      });

      expect(grant.caveatSpecs).toStrictEqual([
        { type: 'cumulativeSpend', token: TOKEN, max: 500n },
        { type: 'blockWindow', after: 0n, before: 1700000000n },
      ]);
    });
  });

  describe('approve', () => {
    it('produces correct caveats', () => {
      const grant = buildDelegationGrant('approve', {
        delegator: ALICE,
        delegate: BOB,
        token: TOKEN,
        max: 2000n,
        chainId: CHAIN_ID,
      });

      expect(grant.methodName).toBe('approve');
      expect(grant.token).toBe(TOKEN);
      const caveatTypes = grant.delegation.caveats.map((cv) => cv.type);
      expect(caveatTypes).toStrictEqual([
        'allowedTargets',
        'allowedMethods',
        'erc20TransferAmount',
      ]);
    });
  });

  describe('call', () => {
    it('produces allowedTargets caveat for provided targets', () => {
      const target1 = '0x3333333333333333333333333333333333333333' as Address;
      const target2 = '0x4444444444444444444444444444444444444444' as Address;
      const grant = buildDelegationGrant('call', {
        delegator: ALICE,
        delegate: BOB,
        targets: [target1, target2],
        chainId: CHAIN_ID,
      });

      expect(grant.methodName).toBe('call');
      expect(grant.caveatSpecs).toStrictEqual([]);
      expect(grant.delegation.caveats[0]?.type).toBe('allowedTargets');
    });

    it('includes valueLte caveat when maxValue provided', () => {
      const grant = buildDelegationGrant('call', {
        delegator: ALICE,
        delegate: BOB,
        targets: [TOKEN],
        chainId: CHAIN_ID,
        maxValue: 10000n,
      });

      const caveatTypes = grant.delegation.caveats.map((cv) => cv.type);
      expect(caveatTypes).toContain('valueLte');
    });

    it('does not include valueLte caveat when maxValue omitted', () => {
      const grant = buildDelegationGrant('call', {
        delegator: ALICE,
        delegate: BOB,
        targets: [TOKEN],
        chainId: CHAIN_ID,
      });

      const caveatTypes = grant.delegation.caveats.map((cv) => cv.type);
      expect(caveatTypes).not.toContain('valueLte');
    });

    it('includes blockWindow caveatSpec when validUntil provided', () => {
      const grant = buildDelegationGrant('call', {
        delegator: ALICE,
        delegate: BOB,
        targets: [TOKEN],
        chainId: CHAIN_ID,
        validUntil: 1700000000,
      });

      expect(grant.delegation.caveats.map((cv) => cv.type)).toContain(
        'timestamp',
      );
      expect(grant.caveatSpecs).toStrictEqual([
        { type: 'blockWindow', after: 0n, before: 1700000000n },
      ]);
    });
  });
});

describe('makeDelegationGrantBuilder', () => {
  it('produces grants with the injected salt generator', () => {
    let counter = 0;
    const fixedSalt = `0x${'ab'.repeat(32)}`;
    const saltGenerator = () => {
      counter += 1;
      return fixedSalt;
    };
    const builder = makeDelegationGrantBuilder({ saltGenerator });

    const grant = builder.buildDelegationGrant('transfer', {
      delegator: ALICE,
      delegate: BOB,
      token: TOKEN,
      max: 100n,
      chainId: CHAIN_ID,
    });

    expect(grant.delegation.salt).toBe(fixedSalt);
    expect(counter).toBe(1);
  });

  it('two builders with independent generators produce different salts', () => {
    const gen1 = makeSaltGenerator('0x01' as `0x${string}`);
    const gen2 = makeSaltGenerator('0x02' as `0x${string}`);
    const builder1 = makeDelegationGrantBuilder({ saltGenerator: gen1 });
    const builder2 = makeDelegationGrantBuilder({ saltGenerator: gen2 });

    const baseOpts = {
      delegator: ALICE,
      delegate: BOB,
      token: TOKEN,
      max: 100n,
      chainId: CHAIN_ID,
    };

    const grant1 = builder1.buildDelegationGrant('transfer', baseOpts);
    const grant2 = builder2.buildDelegationGrant('transfer', baseOpts);

    expect(grant1.delegation.salt).not.toBe(grant2.delegation.salt);
    expect(grant1.delegation.id).not.toBe(grant2.delegation.id);
  });
});
