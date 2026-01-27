import { describe, it, expect } from 'vitest';

import { isValidMnemonic, mnemonicToSeed, seedToMnemonic } from './bip39.ts';

// Valid 12-word test mnemonic
const VALID_12_WORD_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Valid 24-word test mnemonic
const VALID_24_WORD_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

describe('bip39', () => {
  describe('isValidMnemonic', () => {
    it('returns true for valid 12-word mnemonic', () => {
      expect(isValidMnemonic(VALID_12_WORD_MNEMONIC)).toBe(true);
    });

    it('returns true for valid 24-word mnemonic', () => {
      expect(isValidMnemonic(VALID_24_WORD_MNEMONIC)).toBe(true);
    });

    it('returns false for invalid mnemonic (wrong words)', () => {
      const invalidMnemonic = 'invalid words that are not in the wordlist';
      expect(isValidMnemonic(invalidMnemonic)).toBe(false);
    });

    it('returns false for mnemonic with invalid checksum', () => {
      // Valid words but invalid checksum
      const invalidChecksum =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
      expect(isValidMnemonic(invalidChecksum)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidMnemonic('')).toBe(false);
    });

    it('returns false for too few words', () => {
      const tooFew = 'abandon abandon abandon';
      expect(isValidMnemonic(tooFew)).toBe(false);
    });
  });

  describe('mnemonicToSeed', () => {
    it('converts valid 12-word mnemonic to 32-byte hex seed', () => {
      const seed = mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      expect(seed).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/u.test(seed)).toBe(true);
    });

    it('converts valid 24-word mnemonic to 32-byte hex seed', () => {
      const seed = mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      expect(seed).toHaveLength(64);
      expect(/^[0-9a-f]+$/u.test(seed)).toBe(true);
    });

    it('produces same seed for same 12-word mnemonic', () => {
      const seed1 = mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      const seed2 = mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      expect(seed1).toBe(seed2);
    });

    it('produces same seed for same 24-word mnemonic', () => {
      const seed1 = mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      const seed2 = mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      expect(seed1).toBe(seed2);
    });

    it('produces different seeds for different mnemonics', () => {
      // Use a genuinely different mnemonic for comparison
      const differentMnemonic =
        'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
      const seed1 = mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      const seed2 = mnemonicToSeed(differentMnemonic);
      expect(seed1).not.toBe(seed2);
    });

    it('throws for invalid mnemonic', () => {
      expect(() => mnemonicToSeed('invalid mnemonic')).toThrow(
        'Invalid BIP39 mnemonic',
      );
    });
  });

  describe('seedToMnemonic', () => {
    it('converts 32-byte hex seed to 12-word mnemonic', () => {
      const seedHex =
        '0000000000000000000000000000000000000000000000000000000000000000';
      const mnemonic = seedToMnemonic(seedHex);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it('produces same mnemonic for same seed', () => {
      const seedHex =
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const mnemonic1 = seedToMnemonic(seedHex);
      const mnemonic2 = seedToMnemonic(seedHex);
      expect(mnemonic1).toBe(mnemonic2);
    });

    it('produces different mnemonics for different seeds', () => {
      const seed1 =
        '0000000000000000000000000000000000000000000000000000000000000000';
      const seed2 =
        '1111111111111111111111111111111111111111111111111111111111111111';
      const mnemonic1 = seedToMnemonic(seed1);
      const mnemonic2 = seedToMnemonic(seed2);
      expect(mnemonic1).not.toBe(mnemonic2);
    });

    it('throws for seed that is not 32 bytes', () => {
      expect(() => seedToMnemonic('abcdef')).toThrow('Seed must be 32 bytes');
    });
  });

  describe('round-trip conversion', () => {
    it('can recover seed from mnemonic for 12-word mnemonics', () => {
      // Start with mnemonic, convert to seed, convert back to mnemonic
      const originalMnemonic = VALID_12_WORD_MNEMONIC;
      const seed = mnemonicToSeed(originalMnemonic);
      const recoveredMnemonic = seedToMnemonic(seed);
      // The recovered mnemonic should produce the same seed
      const recoveredSeed = mnemonicToSeed(recoveredMnemonic);
      expect(recoveredSeed).toBe(seed);
    });
  });
});
