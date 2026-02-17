import { describe, it, expect } from 'vitest';

import {
  CHAIN_CONTRACTS,
  PLACEHOLDER_CONTRACTS,
  getChainContracts,
} from './constants.ts';
import type { ChainContracts } from './constants.ts';
import type { Address } from './types.ts';

describe('constants', () => {
  describe('getChainContracts', () => {
    it('returns placeholder contracts when no chainId provided', () => {
      expect(getChainContracts()).toBe(PLACEHOLDER_CONTRACTS);
    });

    it('returns placeholder contracts for unknown chainId', () => {
      expect(getChainContracts(99999)).toBe(PLACEHOLDER_CONTRACTS);
    });

    it('returns chain-specific contracts when registered', () => {
      const testContracts: ChainContracts = {
        delegationManager:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
        enforcers: {
          allowedTargets:
            '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address,
          allowedMethods:
            '0xcccccccccccccccccccccccccccccccccccccccc' as Address,
          valueLte: '0xdddddddddddddddddddddddddddddddddddddd' as Address,
          erc20TransferAmount:
            '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address,
          limitedCalls: '0x1111111111111111111111111111111111111111' as Address,
          timestamp: '0x2222222222222222222222222222222222222222' as Address,
        },
      };

      // Register a test chain
      const chainId = 12345;
      CHAIN_CONTRACTS[chainId] = testContracts;

      try {
        expect(getChainContracts(chainId)).toBe(testContracts);
      } finally {
        // Clean up

        delete CHAIN_CONTRACTS[chainId];
      }
    });

    it('returns placeholder contracts when chainId is undefined', () => {
      expect(getChainContracts(undefined)).toBe(PLACEHOLDER_CONTRACTS);
    });
  });
});
