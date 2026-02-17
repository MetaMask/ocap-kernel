import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildRootObject } from './provider-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import { ENTRY_POINT_V07 } from '../lib/userop.ts';
import type { Address, Hex, UserOperation } from '../types.ts';

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

const mockTransportRequest = vi.fn();

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    http: vi.fn(() => () => ({ request: mockTransportRequest })),
  };
});

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

  describe('submitUserOp', () => {
    const mockUserOp: UserOperation = {
      sender: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address,
      nonce: '0x0' as Hex,
      callData: '0xdeadbeef' as Hex,
      callGasLimit: '0x50000' as Hex,
      verificationGasLimit: '0x60000' as Hex,
      preVerificationGas: '0x10000' as Hex,
      maxFeePerGas: '0x3b9aca00' as Hex,
      maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      signature: '0xsig' as Hex,
    };

    it('submits a UserOp via bundler transport', async () => {
      mockTransportRequest.mockResolvedValue('0xuserophash');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (root as any).submitUserOp({
        bundlerUrl: 'https://bundler.example.com',
        entryPoint: ENTRY_POINT_V07,
        userOp: mockUserOp,
      });

      expect(result).toBe('0xuserophash');
      expect(mockTransportRequest).toHaveBeenCalledWith({
        method: 'eth_sendUserOperation',
        params: [mockUserOp, ENTRY_POINT_V07],
      });
    });

    it('propagates transport errors', async () => {
      mockTransportRequest.mockRejectedValue(new Error('bundler error'));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).submitUserOp({
          bundlerUrl: 'https://bundler.example.com',
          entryPoint: ENTRY_POINT_V07,
          userOp: mockUserOp,
        }),
      ).rejects.toThrow('bundler error');
    });
  });

  describe('estimateUserOpGas', () => {
    const mockUserOp: UserOperation = {
      sender: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address,
      nonce: '0x0' as Hex,
      callData: '0xdeadbeef' as Hex,
      callGasLimit: '0x50000' as Hex,
      verificationGasLimit: '0x60000' as Hex,
      preVerificationGas: '0x10000' as Hex,
      maxFeePerGas: '0x3b9aca00' as Hex,
      maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      signature: '0x' as Hex,
    };

    it('estimates gas via bundler transport', async () => {
      const gasEstimate = {
        callGasLimit: '0x50000' as Hex,
        verificationGasLimit: '0x60000' as Hex,
        preVerificationGas: '0x10000' as Hex,
      };
      mockTransportRequest.mockResolvedValue(gasEstimate);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (root as any).estimateUserOpGas({
        bundlerUrl: 'https://bundler.example.com',
        entryPoint: ENTRY_POINT_V07,
        userOp: mockUserOp,
      });

      expect(result).toStrictEqual(gasEstimate);
      expect(mockTransportRequest).toHaveBeenCalledWith({
        method: 'eth_estimateUserOperationGas',
        params: [mockUserOp, ENTRY_POINT_V07],
      });
    });

    it('propagates transport errors', async () => {
      mockTransportRequest.mockRejectedValue(new Error('estimation failed'));

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).estimateUserOpGas({
          bundlerUrl: 'https://bundler.example.com',
          entryPoint: ENTRY_POINT_V07,
          userOp: mockUserOp,
        }),
      ).rejects.toThrow('estimation failed');
    });
  });
});
