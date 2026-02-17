import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeProvider } from './provider.ts';
import type { Provider } from './provider.ts';

const mockTransportRequest = vi.fn();

const mockClient = {
  request: vi.fn(),
  transport: { request: mockTransportRequest },
  sendRawTransaction: vi.fn(),
  getBalance: vi.fn(),
  getChainId: vi.fn(),
  getTransactionCount: vi.fn(),
};

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
  };
});

describe('lib/provider', () => {
  let provider: Provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeProvider({ chainId: 1, rpcUrl: 'https://rpc.example.com' });
  });

  describe('makeProvider', () => {
    it('creates a provider for a known chain', () => {
      const knownProvider = makeProvider({
        chainId: 1,
        rpcUrl: 'https://eth.example.com',
      });
      expect(knownProvider).toBeDefined();
      expect(knownProvider.request).toBeDefined();
      expect(knownProvider.broadcastTransaction).toBeDefined();
      expect(knownProvider.getBalance).toBeDefined();
      expect(knownProvider.getChainId).toBeDefined();
      expect(knownProvider.getNonce).toBeDefined();
    });

    it('creates a provider for a custom chain', () => {
      const customProvider = makeProvider({
        chainId: 99999,
        rpcUrl: 'https://custom-rpc.example.com',
        name: 'Custom Chain',
      });
      expect(customProvider).toBeDefined();
    });
  });

  describe('request', () => {
    it('forwards JSON-RPC calls to the client', async () => {
      mockTransportRequest.mockResolvedValue('0x1');

      const result = await provider.request('eth_chainId', []);
      expect(result).toBe('0x1');
      expect(mockTransportRequest).toHaveBeenCalledWith({
        method: 'eth_chainId',
        params: [],
      });
    });
  });

  describe('broadcastTransaction', () => {
    it('sends a raw transaction', async () => {
      const txHash = '0xabc123';
      mockClient.sendRawTransaction.mockResolvedValue(txHash);

      const result = await provider.broadcastTransaction('0xf86c...');
      expect(result).toBe(txHash);
    });
  });

  describe('getBalance', () => {
    it('returns the balance as a hex string', async () => {
      mockClient.getBalance.mockResolvedValue(1000000000000000000n);

      const balance = await provider.getBalance(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      );
      expect(balance).toBe('0xde0b6b3a7640000');
    });
  });

  describe('getChainId', () => {
    it('returns the chain ID', async () => {
      mockClient.getChainId.mockResolvedValue(1);

      const chainId = await provider.getChainId();
      expect(chainId).toBe(1);
    });
  });

  describe('getNonce', () => {
    it('returns the transaction count', async () => {
      mockClient.getTransactionCount.mockResolvedValue(42);

      const nonce = await provider.getNonce(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      );
      expect(nonce).toBe(42);
    });
  });
});
