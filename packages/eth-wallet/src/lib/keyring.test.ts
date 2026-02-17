import { describe, it, expect } from 'vitest';

import { makeKeyring, generateMnemonicPhrase } from './keyring.ts';

// Deterministic test mnemonic (DO NOT use in production)
const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';

describe('lib/keyring', () => {
  describe('makeKeyring', () => {
    describe('SRP initialization', () => {
      it('derives the first account by default', () => {
        const keyring = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });

        const accounts = keyring.getAccounts();
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatch(/^0x[\da-f]{40}$/iu);
      });

      it('returns consistent addresses for the same mnemonic', () => {
        const keyring1 = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });
        const keyring2 = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });

        expect(keyring1.getAccounts()).toStrictEqual(keyring2.getAccounts());
      });

      it('derives additional accounts at specific indices', () => {
        const keyring = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });

        const addr0 = keyring.getAccounts()[0];
        const addr1 = keyring.deriveAccount(1);
        const addr2 = keyring.deriveAccount(2);

        expect(addr0).not.toBe(addr1);
        expect(addr1).not.toBe(addr2);
        expect(keyring.getAccounts()).toHaveLength(3);
      });

      it('reports having keys', () => {
        const keyring = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });
        expect(keyring.hasKeys()).toBe(true);
      });

      it('exposes the mnemonic', () => {
        const keyring = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });
        expect(keyring.getMnemonic()).toBe(TEST_MNEMONIC);
      });

      it('resolves a local account by address', () => {
        const keyring = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });
        const address = keyring.getAccounts()[0]!;
        const account = keyring.getAccount(address);

        expect(account).toBeDefined();
        expect(account?.address.toLowerCase()).toBe(address);
      });

      it('returns undefined for unknown address', () => {
        const keyring = makeKeyring({ type: 'srp', mnemonic: TEST_MNEMONIC });
        expect(
          keyring.getAccount('0x0000000000000000000000000000000000000000'),
        ).toBeUndefined();
      });
    });

    describe('throwaway initialization', () => {
      it('creates a single random account', () => {
        const keyring = makeKeyring({ type: 'throwaway' });

        const accounts = keyring.getAccounts();
        expect(accounts).toHaveLength(1);
        expect(accounts[0]).toMatch(/^0x[\da-f]{40}$/iu);
      });

      it('generates different addresses each time', () => {
        const keyring1 = makeKeyring({ type: 'throwaway' });
        const keyring2 = makeKeyring({ type: 'throwaway' });

        expect(keyring1.getAccounts()[0]).not.toBe(keyring2.getAccounts()[0]);
      });

      it('throws when trying to derive accounts', () => {
        const keyring = makeKeyring({ type: 'throwaway' });

        expect(() => keyring.deriveAccount(1)).toThrow(
          'Cannot derive accounts from a throwaway keyring',
        );
      });

      it('reports having keys', () => {
        const keyring = makeKeyring({ type: 'throwaway' });
        expect(keyring.hasKeys()).toBe(true);
      });

      it('does not expose a mnemonic', () => {
        const keyring = makeKeyring({ type: 'throwaway' });
        expect(keyring.getMnemonic()).toBeUndefined();
      });
    });
  });

  describe('generateMnemonicPhrase', () => {
    it('generates a 12-word mnemonic', () => {
      const mnemonic = generateMnemonicPhrase();
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
    });

    it('generates different mnemonics each time', () => {
      const mnemonic1 = generateMnemonicPhrase();
      const mnemonic2 = generateMnemonicPhrase();
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });
});
