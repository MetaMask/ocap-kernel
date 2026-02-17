import { privateKeyToAccount } from 'viem/accounts';
import { describe, it, expect } from 'vitest';

import { signTransaction, signMessage, signTypedData } from './signing.ts';

// Deterministic test key (DO NOT use in production)
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const makeTestAccount = () => privateKeyToAccount(TEST_PRIVATE_KEY);

describe('lib/signing', () => {
  describe('signTransaction', () => {
    it('signs an EIP-1559 transaction', async () => {
      const account = makeTestAccount();
      const signed = await signTransaction({
        account,
        tx: {
          from: account.address.toLowerCase() as `0x${string}`,
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
          value: '0xde0b6b3a7640000',
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00',
          maxPriorityFeePerGas: '0x3b9aca00',
        },
      });

      expect(signed).toMatch(/^0x/u);
      expect(signed.length).toBeGreaterThan(2);
    });

    it('signs a legacy transaction', async () => {
      const account = makeTestAccount();
      const signed = await signTransaction({
        account,
        tx: {
          from: account.address.toLowerCase() as `0x${string}`,
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
          value: '0xde0b6b3a7640000',
          chainId: 1,
          nonce: 0,
          gasPrice: '0x3b9aca00',
        },
      });

      expect(signed).toMatch(/^0x/u);
    });

    it('signs a transaction with data', async () => {
      const account = makeTestAccount();
      const signed = await signTransaction({
        account,
        tx: {
          from: account.address.toLowerCase() as `0x${string}`,
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
          data: '0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001',
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00',
          maxPriorityFeePerGas: '0x3b9aca00',
        },
      });

      expect(signed).toMatch(/^0x/u);
    });
  });

  describe('signMessage', () => {
    it('signs a personal message', async () => {
      const account = makeTestAccount();
      const signature = await signMessage({
        account,
        message: 'Hello, world!',
      });

      expect(signature).toMatch(/^0x/u);
      // EIP-191 signatures are 65 bytes = 130 hex chars + 0x prefix
      expect(signature).toHaveLength(132);
    });

    it('produces deterministic signatures', async () => {
      const account = makeTestAccount();
      const sig1 = await signMessage({ account, message: 'test' });
      const sig2 = await signMessage({ account, message: 'test' });

      expect(sig1).toBe(sig2);
    });

    it('produces different signatures for different messages', async () => {
      const account = makeTestAccount();
      const sig1 = await signMessage({ account, message: 'hello' });
      const sig2 = await signMessage({ account, message: 'world' });

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('signTypedData', () => {
    it('signs EIP-712 typed data', async () => {
      const account = makeTestAccount();
      const signature = await signTypedData({
        account,
        typedData: {
          domain: {
            name: 'Test',
            version: '1',
            chainId: 1,
            verifyingContract: '0xcccccccccccccccccccccccccccccccccccccccc',
          },
          types: {
            Person: [
              { name: 'name', type: 'string' },
              { name: 'wallet', type: 'address' },
            ],
          },
          primaryType: 'Person',
          message: {
            name: 'Alice',
            wallet: '0xcccccccccccccccccccccccccccccccccccccccc',
          },
        },
      });

      expect(signature).toMatch(/^0x/u);
      expect(signature).toHaveLength(132);
    });
  });
});
