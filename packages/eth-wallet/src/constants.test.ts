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

    it('returns placeholder contracts for unknown chainId', () => {
      expect(getChainContracts(99999)).toBe(PLACEHOLDER_CONTRACTS);
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

    it('returns real Sepolia addresses from SDK', () => {
      const contracts = getChainContracts(SEPOLIA_CHAIN_ID);

      expect(contracts.delegationManager).toMatch(/^0x[\da-f]{40}$/iu);
      expect(contracts.delegationManager).not.toBe(
        PLACEHOLDER_CONTRACTS.delegationManager,
      );

      expect(contracts.enforcers.allowedTargets).toMatch(/^0x[\da-f]{40}$/iu);
      expect(contracts.enforcers.allowedMethods).toMatch(/^0x[\da-f]{40}$/iu);
      expect(contracts.enforcers.valueLte).toMatch(/^0x[\da-f]{40}$/iu);
      expect(contracts.enforcers.erc20TransferAmount).toMatch(
        /^0x[\da-f]{40}$/iu,
      );
      expect(contracts.enforcers.limitedCalls).toMatch(/^0x[\da-f]{40}$/iu);
      expect(contracts.enforcers.timestamp).toMatch(/^0x[\da-f]{40}$/iu);
    });

    it('prefers SDK environment over manual registry for known chains', () => {
      const sdkContracts = getChainContracts(SEPOLIA_CHAIN_ID);

      // Temporarily register manual contracts for Sepolia
      CHAIN_CONTRACTS[SEPOLIA_CHAIN_ID] = PLACEHOLDER_CONTRACTS;

      try {
        // SDK should still win
        const contracts = getChainContracts(SEPOLIA_CHAIN_ID);
        expect(contracts.delegationManager).toBe(
          sdkContracts.delegationManager,
        );
      } finally {
        delete CHAIN_CONTRACTS[SEPOLIA_CHAIN_ID];
      }
    });
  });
});
