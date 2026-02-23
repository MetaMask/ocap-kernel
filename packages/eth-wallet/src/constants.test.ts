import { describe, it, expect } from 'vitest';

import {
  CHAIN_CONTRACTS,
  PLACEHOLDER_CONTRACTS,
  SEPOLIA_CHAIN_ID,
  PIMLICO_RPC_BASE_URL,
  getChainContracts,
} from './constants.ts';
import type { ChainContracts } from './constants.ts';
import type { Address } from './types.ts';

describe('constants', () => {
  describe('SEPOLIA_CHAIN_ID', () => {
    it('is 11155111', () => {
      expect(SEPOLIA_CHAIN_ID).toBe(11155111);
    });
  });

  describe('PIMLICO_RPC_BASE_URL', () => {
    it('is a valid HTTPS URL', () => {
      expect(PIMLICO_RPC_BASE_URL).toMatch(/^https:\/\//u);
    });
  });

  describe('getChainContracts', () => {
    it('returns placeholder contracts when no chainId provided', () => {
      expect(getChainContracts()).toBe(PLACEHOLDER_CONTRACTS);
    });

    it('throws for unknown chainId', () => {
      expect(() => getChainContracts(99999)).toThrow(
        'No contract addresses registered for chain 99999',
      );
    });

    it('returns chain-specific contracts when registered in manual registry', () => {
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

      // Register a test chain (SDK doesn't know this ID, so manual fallback)
      const chainId = 12345;
      CHAIN_CONTRACTS[chainId] = testContracts;

      try {
        expect(getChainContracts(chainId)).toBe(testContracts);
      } finally {
        delete CHAIN_CONTRACTS[chainId];
      }
    });

    it('returns placeholder contracts when chainId is undefined', () => {
      expect(getChainContracts(undefined)).toBe(PLACEHOLDER_CONTRACTS);
    });
  });
});
