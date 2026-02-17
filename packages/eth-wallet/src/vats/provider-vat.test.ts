import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildRootObject } from './provider-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import type { Address, Hex } from '../types.ts';

const mockProvider = {
  request: vi.fn(),
  broadcastTransaction: vi.fn(),
  getBalance: vi.fn(),
  getChainId: vi.fn(),
  getNonce: vi.fn(),
};

vi.mock('../lib/provider.ts', () => ({
  makeProvider: vi.fn(() => mockProvider),
}));

describe('provider-vat', () => {
  let baggage: ReturnType<typeof makeMockBaggage>;
  let root: ReturnType<typeof buildRootObject>;

  beforeEach(() => {
    vi.clearAllMocks();
    baggage = makeMockBaggage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    root = buildRootObject({}, undefined, baggage as any);
  });

  describe('bootstrap', () => {
    it('completes without error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await (root as any).bootstrap()).toBeUndefined();
    });
  });

  describe('configure', () => {
    it('configures the provider with chain config', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).configure({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      expect(baggage.has('chainConfig')).toBe(true);
    });
  });

  describe('request', () => {
    it('throws when provider is not configured', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).request('eth_chainId'),
      ).rejects.toThrow('Provider not configured');
    });

    it('forwards JSON-RPC calls after configuration', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).configure({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      mockProvider.request.mockResolvedValue('0x1');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (root as any).request('eth_chainId');
      expect(result).toBe('0x1');
    });
  });

  describe('broadcastTransaction', () => {
    it('sends a raw transaction', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).configure({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      const txHash = '0xabc123' as Hex;
      mockProvider.broadcastTransaction.mockResolvedValue(txHash);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (root as any).broadcastTransaction('0xf86c...');
      expect(result).toBe(txHash);
    });
  });

  describe('getBalance', () => {
    it('returns balance', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).configure({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      mockProvider.getBalance.mockResolvedValue('0xde0b6b3a7640000');
      const balance = await (
        root as { getBalance: (a: Address) => Promise<string> }
      ).getBalance('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
      expect(balance).toBe('0xde0b6b3a7640000');
    });
  });

  describe('getChainId', () => {
    it('returns chain ID', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).configure({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      mockProvider.getChainId.mockResolvedValue(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chainId = await (root as any).getChainId();
      expect(chainId).toBe(1);
    });
  });

  describe('getNonce', () => {
    it('returns nonce', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).configure({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });

      mockProvider.getNonce.mockResolvedValue(42);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nonce = await (root as any).getNonce(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      );
      expect(nonce).toBe(42);
    });
  });
});
