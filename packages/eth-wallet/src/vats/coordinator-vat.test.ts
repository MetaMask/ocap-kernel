import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildRootObject as buildDelegationRoot } from './delegation-vat.ts';
import { buildRootObject as buildKeyringRoot } from './keyring-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';
import { encodeAllowedTargets, makeCaveat } from '../lib/caveats.ts';
import type { Address, Hex, TransactionRequest } from '../types.ts';

// Mock E() to call methods directly on plain objects
vi.mock('@endo/eventual-send', () => ({
  E: (target: Record<string, (...args: unknown[]) => unknown>) => {
    return new Proxy(target, {
      get(_target, prop: string) {
        return (...args: unknown[]) => {
          const method = _target[prop];
          if (typeof method !== 'function') {
            throw new Error(`${prop} is not a function on target`);
          }
          return method.call(_target, ...args);
        };
      },
    });
  },
}));

// Dynamic import after mocking
const { buildRootObject } = await import('./coordinator-vat.ts');

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const TARGET = '0x1234567890abcdef1234567890abcdef12345678' as Address;

function makeMockProviderVat() {
  return {
    bootstrap: vi.fn(),
    configure: vi.fn(),
    request: vi.fn(),
    broadcastTransaction: vi.fn().mockResolvedValue('0xtxhash'),
    getBalance: vi.fn(),
    getChainId: vi.fn(),
    getNonce: vi.fn(),
  };
}

describe('coordinator-vat', () => {
  let coordinatorBaggage: ReturnType<typeof makeMockBaggage>;
  let keyringBaggage: ReturnType<typeof makeMockBaggage>;
  let delegationBaggage: ReturnType<typeof makeMockBaggage>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let coordinator: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let keyringVat: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let delegationVat: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let providerVat: any;

  beforeEach(async () => {
    coordinatorBaggage = makeMockBaggage();
    keyringBaggage = makeMockBaggage();
    delegationBaggage = makeMockBaggage();

    // Build real keyring and delegation vats (unit test with real inner vats)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    keyringVat = buildKeyringRoot({}, undefined, keyringBaggage as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delegationVat = buildDelegationRoot({}, {}, delegationBaggage as any);
    providerVat = makeMockProviderVat();

    coordinator = buildRootObject(
      {},
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      coordinatorBaggage as any,
    );

    await coordinator.bootstrap(
      { keyring: keyringVat, provider: providerVat, delegation: delegationVat },
      {},
    );
  });

  describe('bootstrap', () => {
    it('stores vat references in baggage', () => {
      expect(coordinatorBaggage.has('keyringVat')).toBe(true);
      expect(coordinatorBaggage.has('providerVat')).toBe(true);
      expect(coordinatorBaggage.has('delegationVat')).toBe(true);
    });
  });

  describe('initializeKeyring', () => {
    it('initializes the keyring with SRP', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      expect(accounts).toHaveLength(1);
    });

    it('initializes the keyring with throwaway key', async () => {
      await coordinator.initializeKeyring({ type: 'throwaway' });

      const accounts = await coordinator.getAccounts();
      expect(accounts).toHaveLength(1);
    });
  });

  describe('signing strategy resolution', () => {
    describe('local key signing', () => {
      it('signs with local key when account is owned', async () => {
        await coordinator.initializeKeyring({
          type: 'srp',
          mnemonic: TEST_MNEMONIC,
        });

        const accounts = await coordinator.getAccounts();
        const tx: TransactionRequest = {
          from: accounts[0],
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
          value: '0xde0b6b3a7640000' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        };

        const signed = await coordinator.signTransaction(tx);
        expect(signed).toMatch(/^0x/u);
      });
    });

    describe('delegation-based signing', () => {
      it('uses delegation path when a matching delegation exists', async () => {
        await coordinator.initializeKeyring({
          type: 'srp',
          mnemonic: TEST_MNEMONIC,
        });

        const accounts = await coordinator.getAccounts();
        const delegator = accounts[0] as Address;

        // Create and sign a delegation covering the target
        const delegation = await delegationVat.createDelegation({
          delegator,
          delegate: delegator,
          caveats: [
            makeCaveat({
              type: 'allowedTargets',
              terms: encodeAllowedTargets([TARGET]),
            }),
          ],
          chainId: 1,
        });
        await delegationVat.storeSigned(delegation.id, '0xdeadbeef' as Hex);

        const tx: TransactionRequest = {
          from: delegator,
          to: TARGET,
          value: '0x0' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        };

        const signed = await coordinator.signTransaction(tx);
        expect(signed).toMatch(/^0x/u);
      });
    });

    describe('no authority', () => {
      it('rejects when no signing strategy is available', async () => {
        await coordinator.initializeKeyring({ type: 'throwaway' });

        const tx: TransactionRequest = {
          from: '0x0000000000000000000000000000000000000099' as Address,
          to: TARGET,
          chainId: 1,
          nonce: 0,
        };

        await expect(coordinator.signTransaction(tx)).rejects.toThrow(
          'No authority to sign this transaction',
        );
      });
    });

    describe('peer wallet fallback', () => {
      it('forwards to peer wallet when no local authority', async () => {
        const mockPeerWallet = {
          handleSigningRequest: vi
            .fn()
            .mockResolvedValue('0xpeersigned' as Hex),
        };

        // Build coordinator with peer wallet in baggage
        const freshBaggage = makeMockBaggage();
        freshBaggage.init('peerWallet', mockPeerWallet);

        const coordinatorWithPeer = buildRootObject(
          {},
          undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          freshBaggage as any,
        );

        const tx: TransactionRequest = {
          from: '0x0000000000000000000000000000000000000099' as Address,
          to: TARGET,
          chainId: 1,
          nonce: 0,
        };

        const signed = await coordinatorWithPeer.signTransaction(tx);
        expect(signed).toBe('0xpeersigned');
        expect(mockPeerWallet.handleSigningRequest).toHaveBeenCalledWith({
          type: 'transaction',
          tx,
        });
      });
    });
  });

  describe('sendTransaction', () => {
    it('signs and broadcasts a transaction', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const tx: TransactionRequest = {
        from: accounts[0],
        to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        value: '0xde0b6b3a7640000' as Hex,
        chainId: 1,
        nonce: 0,
        maxFeePerGas: '0x3b9aca00' as Hex,
        maxPriorityFeePerGas: '0x3b9aca00' as Hex,
      };

      const txHash = await coordinator.sendTransaction(tx);
      expect(txHash).toBe('0xtxhash');
      expect(providerVat.broadcastTransaction).toHaveBeenCalled();
    });
  });

  describe('signMessage', () => {
    it('signs a message with local key', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const signature = await coordinator.signMessage('Hello, world!');
      expect(signature).toMatch(/^0x/u);
      expect(signature).toHaveLength(132);
    });

    it('rejects when no authority', async () => {
      const emptyBaggage = makeMockBaggage();

      const emptyCoordinator = buildRootObject(
        {},
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emptyBaggage as any,
      );
      await emptyCoordinator.bootstrap({ provider: providerVat }, {});

      await expect(emptyCoordinator.signMessage('test')).rejects.toThrow(
        'No authority to sign message',
      );
    });
  });

  describe('delegation management', () => {
    it('creates a delegation (full flow)', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const delegation = await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([TARGET]),
          }),
        ],
        chainId: 1,
      });

      expect(delegation.status).toBe('signed');
      expect(delegation.signature).toBeDefined();
    });

    it('lists delegations', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      await coordinator.createDelegation({
        delegate: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
        caveats: [],
        chainId: 1,
      });

      const delegations = await coordinator.listDelegations();
      expect(delegations).toHaveLength(1);
    });
  });

  describe('getCapabilities', () => {
    it('reports wallet capabilities', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const caps = await coordinator.getCapabilities();
      expect(caps).toStrictEqual({
        hasLocalKeys: true,
        localAccounts: expect.arrayContaining([
          expect.stringMatching(/^0x[\da-f]{40}$/iu),
        ]),
        delegationCount: 0,
        hasPeerWallet: false,
      });
    });
  });

  describe('handleSigningRequest', () => {
    it('handles transaction signing requests', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const accounts = await coordinator.getAccounts();
      const signed = await coordinator.handleSigningRequest({
        type: 'transaction',
        tx: {
          from: accounts[0],
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Address,
          value: '0xde0b6b3a7640000' as Hex,
          chainId: 1,
          nonce: 0,
          maxFeePerGas: '0x3b9aca00' as Hex,
          maxPriorityFeePerGas: '0x3b9aca00' as Hex,
        },
      });

      expect(signed).toMatch(/^0x/u);
    });

    it('handles message signing requests', async () => {
      await coordinator.initializeKeyring({
        type: 'srp',
        mnemonic: TEST_MNEMONIC,
      });

      const signed = await coordinator.handleSigningRequest({
        type: 'message',
        message: 'Hello',
      });

      expect(signed).toMatch(/^0x/u);
    });

    it('rejects unknown request types', async () => {
      await expect(
        coordinator.handleSigningRequest({ type: 'unknown' }),
      ).rejects.toThrow('Unknown signing request type');
    });
  });
});
