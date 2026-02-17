import { describe, it, expect, vi } from 'vitest';

import { makeProviderSigner } from './metamask-signer.ts';
import type { EthereumProvider } from './metamask-signer.ts';
import type { Address, Hex } from '../types.ts';

const ALICE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ALICE_LOWER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Address;

const makeTestProvider = (): EthereumProvider & {
  request: ReturnType<typeof vi.fn>;
} => ({
  request: vi.fn(),
});

describe('lib/metamask-signer', () => {
  describe('makeProviderSigner', () => {
    describe('getAccounts', () => {
      it('requests accounts and lowercases them', async () => {
        const provider = makeTestProvider();
        provider.request.mockResolvedValueOnce([ALICE]);

        const signer = makeProviderSigner(provider);
        const accounts = await signer.getAccounts();

        expect(accounts).toStrictEqual([ALICE_LOWER]);
        expect(provider.request).toHaveBeenCalledWith({
          method: 'eth_requestAccounts',
        });
      });

      it('caches accounts after first request', async () => {
        const provider = makeTestProvider();
        provider.request.mockResolvedValueOnce([ALICE]);

        const signer = makeProviderSigner(provider);

        const first = await signer.getAccounts();
        const second = await signer.getAccounts();

        expect(first).toBe(second);
        expect(provider.request).toHaveBeenCalledTimes(1);
      });
    });

    describe('signTypedData', () => {
      it('calls eth_signTypedData_v4 with JSON-stringified data', async () => {
        const provider = makeTestProvider();
        const expectedSig = '0xdeadbeef' as Hex;
        provider.request.mockResolvedValueOnce(expectedSig);

        const signer = makeProviderSigner(provider);
        const typedData = {
          domain: { name: 'Test' },
          types: { Test: [{ name: 'value', type: 'uint256' }] },
          primaryType: 'Test',
          message: { value: '1' },
        };

        const signature = await signer.signTypedData(typedData, ALICE_LOWER);

        expect(signature).toBe(expectedSig);
        expect(provider.request).toHaveBeenCalledWith({
          method: 'eth_signTypedData_v4',
          params: [ALICE_LOWER, JSON.stringify(typedData)],
        });
      });
    });

    describe('signMessage', () => {
      it('calls personal_sign', async () => {
        const provider = makeTestProvider();
        const expectedSig = '0xdeadbeef' as Hex;
        provider.request.mockResolvedValueOnce(expectedSig);

        const signer = makeProviderSigner(provider);
        const signature = await signer.signMessage('hello', ALICE_LOWER);

        expect(signature).toBe(expectedSig);
        expect(provider.request).toHaveBeenCalledWith({
          method: 'personal_sign',
          params: ['hello', ALICE_LOWER],
        });
      });
    });

    describe('signTransaction', () => {
      it('calls eth_signTransaction', async () => {
        const provider = makeTestProvider();
        const expectedSig = '0xdeadbeef' as Hex;
        provider.request.mockResolvedValueOnce(expectedSig);

        const signer = makeProviderSigner(provider);
        const tx = {
          from: ALICE_LOWER,
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        };

        const signature = await signer.signTransaction(tx);

        expect(signature).toBe(expectedSig);
        expect(provider.request).toHaveBeenCalledWith({
          method: 'eth_signTransaction',
          params: [tx],
        });
      });
    });

    describe('disconnect', () => {
      it('clears cached accounts', async () => {
        const provider = makeTestProvider();
        provider.request.mockResolvedValue([ALICE]);

        const signer = makeProviderSigner(provider);

        await signer.getAccounts();
        signer.disconnect();

        // After disconnect, should re-request accounts
        await signer.getAccounts();
        expect(provider.request).toHaveBeenCalledTimes(2);
      });

      it('calls the disconnect callback', () => {
        const provider = makeTestProvider();
        const disconnectFn = vi.fn();

        const signer = makeProviderSigner(provider, {
          disconnect: disconnectFn,
        });

        signer.disconnect();

        expect(disconnectFn).toHaveBeenCalledTimes(1);
      });
    });

    describe('provider', () => {
      it('exposes the underlying provider', () => {
        const provider = makeTestProvider();
        const signer = makeProviderSigner(provider);

        expect(signer.provider).toBe(provider);
      });
    });
  });
});
