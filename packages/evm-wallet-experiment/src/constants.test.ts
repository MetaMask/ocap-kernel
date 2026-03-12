import { describe, it, expect } from 'vitest';

import {
  CHAIN_CONTRACTS,
  CHAIN_NAMES,
  PLACEHOLDER_CONTRACTS,
  SEPOLIA_CHAIN_ID,
  PIMLICO_RPC_BASE_URL,
  SUPPORTED_CHAIN_IDS,
  getChainContracts,
  getPimlicoRpcUrl,
} from './constants.ts';
import { CaveatTypeValues } from './types.ts';

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

  describe('SUPPORTED_CHAIN_IDS', () => {
    it('contains all 8 supported chains', () => {
      expect(SUPPORTED_CHAIN_IDS).toStrictEqual([
        1, 10, 56, 137, 8453, 42161, 59144, 11155111,
      ]);
    });

    it('has a matching entry in CHAIN_CONTRACTS for every ID', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        expect(CHAIN_CONTRACTS[chainId]).toBeDefined();
      }
    });

    it('has a matching entry in CHAIN_NAMES for every ID', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        expect(CHAIN_NAMES[chainId]).toBeDefined();
      }
    });

    it('has a Pimlico URL for every ID', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        expect(() => getPimlicoRpcUrl(chainId)).not.toThrow();
      }
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

    it('returns placeholder contracts when chainId is undefined', () => {
      expect(getChainContracts(undefined)).toBe(PLACEHOLDER_CONTRACTS);
    });

    it.each([1, 10, 56, 137, 8453, 42161, 59144, 11155111])(
      'returns valid contracts for chain %i',
      (chainId) => {
        const contracts = getChainContracts(chainId);
        expect(contracts.delegationManager).toMatch(/^0x[0-9a-fA-F]{40}$/u);
        for (const caveatType of CaveatTypeValues) {
          expect(contracts.enforcers[caveatType]).toMatch(
            /^0x[0-9a-fA-F]{40}$/u,
          );
        }
      },
    );

    it('valueLte and nativeTokenTransferAmount use distinct addresses on all chains', () => {
      for (const chainId of SUPPORTED_CHAIN_IDS) {
        const contracts = getChainContracts(chainId);
        expect(contracts.enforcers.valueLte).not.toBe(
          contracts.enforcers.nativeTokenTransferAmount,
        );
      }
    });
  });

  describe('getPimlicoRpcUrl', () => {
    it.each([
      [1, 'ethereum'],
      [10, 'optimism'],
      [56, 'binance'],
      [137, 'polygon'],
      [8453, 'base'],
      [42161, 'arbitrum'],
      [59144, 'linea'],
      [11155111, 'sepolia'],
    ])('returns correct URL for chain %i (%s)', (chainId, slug) => {
      expect(getPimlicoRpcUrl(chainId)).toBe(
        `https://api.pimlico.io/v2/${slug}/rpc`,
      );
    });

    it('throws for unsupported chain', () => {
      expect(() => getPimlicoRpcUrl(99999)).toThrow(
        'No Pimlico bundler URL for chain 99999',
      );
    });
  });
});
