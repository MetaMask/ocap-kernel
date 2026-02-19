import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Hex } from '../types.ts';

const mockRequest = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createClient: vi.fn(() => ({
      request: mockRequest,
      extend: vi.fn().mockReturnThis(),
    })),
    http: vi.fn(() => 'mock-transport'),
  };
});

vi.mock('viem/account-abstraction', () => ({
  bundlerActions: vi.fn(() => (client: unknown) => client),
}));

// Dynamic import after mocking
const { makeBundlerClient } = await import('./bundler-client.ts');

describe('lib/bundler-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('makeBundlerClient', () => {
    it('creates a client', () => {
      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      expect(client).toBeDefined();
      expect(client.sendUserOperation).toBeDefined();
      expect(client.estimateUserOperationGas).toBeDefined();
      expect(client.getUserOperationReceipt).toBeDefined();
      expect(client.waitForUserOperationReceipt).toBeDefined();
    });
  });

  describe('sendUserOperation', () => {
    it('sends a user operation via RPC', async () => {
      mockRequest.mockResolvedValue('0xuserophash');

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const result = await client.sendUserOperation({
        userOp: {} as never,
        entryPointAddress: '0x0000000071727de22e5e9d8baf0edac6f37da032' as Hex,
      });

      expect(result).toBe('0xuserophash');
      expect(mockRequest).toHaveBeenCalledWith({
        method: 'eth_sendUserOperation',
        params: [{}, '0x0000000071727de22e5e9d8baf0edac6f37da032'],
      });
    });
  });

  describe('estimateUserOperationGas', () => {
    it('returns gas estimates as bigints', async () => {
      mockRequest.mockResolvedValue({
        callGasLimit: '0x50000',
        verificationGasLimit: '0x60000',
        preVerificationGas: '0x10000',
      });

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const estimate = await client.estimateUserOperationGas({
        userOp: {} as never,
        entryPointAddress: '0x0000000071727de22e5e9d8baf0edac6f37da032' as Hex,
      });

      expect(estimate.callGasLimit).toBe(0x50000n);
      expect(estimate.verificationGasLimit).toBe(0x60000n);
      expect(estimate.preVerificationGas).toBe(0x10000n);
    });
  });

  describe('getUserOperationReceipt', () => {
    it('returns receipt when found', async () => {
      const receipt = { success: true, receipt: { transactionHash: '0xabc' } };
      mockRequest.mockResolvedValue(receipt);

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const result = await client.getUserOperationReceipt('0xdeadbeef' as Hex);
      expect(result).toStrictEqual(receipt);
    });

    it('returns null when receipt is not found', async () => {
      mockRequest.mockResolvedValue(null);

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const result = await client.getUserOperationReceipt('0xdeadbeef' as Hex);
      expect(result).toBeNull();
    });
  });

  describe('waitForUserOperationReceipt', () => {
    it('returns receipt when found immediately', async () => {
      const receipt = { success: true };
      mockRequest.mockResolvedValue(receipt);

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const result = await client.waitForUserOperationReceipt({
        hash: '0xdeadbeef' as Hex,
      });
      expect(result).toStrictEqual(receipt);
    });

    it('polls and returns receipt after retries', async () => {
      const receipt = { success: true };
      mockRequest.mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      const result = await client.waitForUserOperationReceipt({
        hash: '0xdeadbeef' as Hex,
        pollingInterval: 1,
        timeout: 5000,
      });

      expect(result).toStrictEqual(receipt);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('throws on timeout', async () => {
      mockRequest.mockResolvedValue(null);

      const client = makeBundlerClient({
        bundlerUrl: 'https://bundler.example.com',
        chainId: 1,
      });

      await expect(
        client.waitForUserOperationReceipt({
          hash: '0xdeadbeef' as Hex,
          pollingInterval: 1,
          timeout: 10,
        }),
      ).rejects.toThrow('not included after 10ms');
    });
  });
});
