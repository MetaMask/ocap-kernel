import { describe, it, expect, beforeEach } from 'vitest';

import { buildRootObject } from './keyring-vat.ts';
import { makeMockBaggage } from '../../test/helpers.ts';

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

describe('keyring-vat', () => {
  let baggage: ReturnType<typeof makeMockBaggage>;
  let root: ReturnType<typeof buildRootObject>;

  beforeEach(() => {
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

  describe('initialize', () => {
    it('initializes with SRP mnemonic', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasKeys = await (root as any).hasKeys();
      expect(hasKeys).toBe(true);
    });

    it('initializes with throwaway key', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'throwaway' });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasKeys = await (root as any).hasKeys();
      expect(hasKeys).toBe(true);
    });

    it('throws if already initialized', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'throwaway' });

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).initialize({ type: 'throwaway' }),
      ).rejects.toThrow('Keyring already initialized');
    });

    it('persists init options in baggage', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      expect(baggage.has('keyringInit')).toBe(true);
    });
  });

  describe('getAccounts', () => {
    it('returns empty array when not initialized', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = await (root as any).getAccounts();
      expect(accounts).toStrictEqual([]);
    });

    it('returns accounts after SRP initialization', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = await (root as any).getAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatch(/^0x[\da-f]{40}$/iu);
    });
  });

  describe('deriveAccount', () => {
    it('derives a new account at a given index', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const address = await (root as any).deriveAccount(1);
      expect(address).toMatch(/^0x[\da-f]{40}$/iu);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = await (root as any).getAccounts();
      expect(accounts).toHaveLength(2);
    });

    it('throws when not initialized', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).deriveAccount(0),
      ).rejects.toThrow('Keyring not initialized');
    });
  });

  describe('signTransaction', () => {
    it('signs a transaction', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = await (root as any).getAccounts();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signed = await (root as any).signTransaction({
        from: accounts[0],
        to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        value: '0xde0b6b3a7640000',
        chainId: 1,
        nonce: 0,
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
      });

      expect(signed).toMatch(/^0x/u);
    });

    it('throws for unknown account', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (root as any).signTransaction({
          from: '0x0000000000000000000000000000000000000000',
          to: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
          chainId: 1,
          nonce: 0,
        }),
      ).rejects.toThrow('No key for account');
    });
  });

  describe('signMessage', () => {
    it('signs a personal message', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signature = await (root as any).signMessage('Hello, world!');
      expect(signature).toMatch(/^0x/u);
      expect(signature).toHaveLength(132);
    });
  });

  describe('resuscitation from baggage', () => {
    it('restores keyring from persisted init options', async () => {
      // Initialize and persist
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (root as any).initialize({ type: 'srp', mnemonic: TEST_MNEMONIC });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accountsBefore = await (root as any).getAccounts();

      // Create a new root object with the same baggage (simulates resuscitation)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const restoredRoot = buildRootObject({}, undefined, baggage as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accountsAfter = await (restoredRoot as any).getAccounts();
      expect(accountsAfter).toStrictEqual(accountsBefore);
    });
  });
});
