import { decodeAbiParameters, parseAbiParameters } from 'viem';
import { describe, it, expect } from 'vitest';

import {
  encodeAllowedTargets,
  encodeAllowedMethods,
  encodeValueLte,
  encodeErc20TransferAmount,
  encodeLimitedCalls,
  encodeTimestamp,
  makeCaveat,
  getEnforcerAddress,
} from './caveats.ts';
import type { Address, Hex } from '../types.ts';

describe('lib/caveats', () => {
  describe('encodeAllowedTargets', () => {
    it('encodes a single target address', () => {
      const target = '0x1234567890abcdef1234567890abcdef12345678' as Address;
      const encoded = encodeAllowedTargets([target]);

      expect(encoded).toMatch(/^0x/u);
      const [decoded] = decodeAbiParameters(
        parseAbiParameters('address[]'),
        encoded,
      );
      expect(decoded.map((a) => a.toLowerCase())).toStrictEqual([target]);
    });

    it('encodes multiple target addresses', () => {
      const targets: Address[] = [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ];
      const encoded = encodeAllowedTargets(targets);

      const [decoded] = decodeAbiParameters(
        parseAbiParameters('address[]'),
        encoded,
      );
      expect(decoded.map((a) => a.toLowerCase())).toStrictEqual(targets);
    });
  });

  describe('encodeAllowedMethods', () => {
    it('encodes function selectors', () => {
      const selectors: Hex[] = ['0xa9059cbb', '0x095ea7b3'];
      const encoded = encodeAllowedMethods(selectors);

      expect(encoded).toMatch(/^0x/u);
      const [decoded] = decodeAbiParameters(
        parseAbiParameters('bytes4[]'),
        encoded,
      );
      expect(decoded).toHaveLength(2);
    });
  });

  describe('encodeValueLte', () => {
    it('encodes a max value', () => {
      const maxValue = 1000000000000000000n; // 1 ETH
      const encoded = encodeValueLte(maxValue);

      const [decoded] = decodeAbiParameters(
        parseAbiParameters('uint256'),
        encoded,
      );
      expect(decoded).toBe(maxValue);
    });
  });

  describe('encodeErc20TransferAmount', () => {
    it('encodes token address and amount', () => {
      const token = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
      const amount = 1000000n; // 1 USDC (6 decimals)
      const encoded = encodeErc20TransferAmount({ token, amount });

      const [decodedToken, decodedAmount] = decodeAbiParameters(
        parseAbiParameters('address, uint256'),
        encoded,
      );
      expect(decodedToken.toLowerCase()).toBe(token);
      expect(decodedAmount).toBe(amount);
    });
  });

  describe('encodeLimitedCalls', () => {
    it('encodes max call count', () => {
      const encoded = encodeLimitedCalls(10);

      const [decoded] = decodeAbiParameters(
        parseAbiParameters('uint256'),
        encoded,
      );
      expect(decoded).toBe(10n);
    });
  });

  describe('encodeTimestamp', () => {
    it('encodes a time window', () => {
      const after = 1700000000;
      const before = 1800000000;
      const encoded = encodeTimestamp({ after, before });

      const [decodedAfter, decodedBefore] = decodeAbiParameters(
        parseAbiParameters('uint128, uint128'),
        encoded,
      );
      expect(decodedAfter).toBe(BigInt(after));
      expect(decodedBefore).toBe(BigInt(before));
    });
  });

  describe('makeCaveat', () => {
    it('creates a caveat with default enforcer address', () => {
      const terms = encodeAllowedTargets([
        '0x1234567890abcdef1234567890abcdef12345678',
      ]);
      const caveat = makeCaveat({ type: 'allowedTargets', terms });

      expect(caveat).toStrictEqual({
        enforcer: getEnforcerAddress('allowedTargets'),
        terms,
        type: 'allowedTargets',
      });
    });

    it('creates a caveat with custom enforcer address', () => {
      const customEnforcer =
        '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Address;
      const terms = encodeValueLte(1000000000000000000n);
      const caveat = makeCaveat({
        type: 'valueLte',
        terms,
        enforcerAddress: customEnforcer,
      });

      expect(caveat.enforcer).toBe(customEnforcer);
    });
  });

  describe('getEnforcerAddress', () => {
    it('returns an address for each caveat type', () => {
      const types = [
        'allowedTargets',
        'allowedMethods',
        'valueLte',
        'erc20TransferAmount',
        'limitedCalls',
        'timestamp',
      ] as const;

      for (const caveatType of types) {
        expect(getEnforcerAddress(caveatType)).toMatch(/^0x/u);
      }
    });
  });
});
