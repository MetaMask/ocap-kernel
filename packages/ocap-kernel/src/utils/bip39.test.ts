import { describe, it, expect } from 'vitest';

import { generateMnemonic, isValidMnemonic, mnemonicToSeed } from './bip39.ts';

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

    it('returns true for valid 15-word mnemonic', () => {
      const valid15Word =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon address';
      expect(isValidMnemonic(valid15Word)).toBe(true);
    });

    it('returns true for valid 18-word mnemonic', () => {
      const valid18Word =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon agent';
      expect(isValidMnemonic(valid18Word)).toBe(true);
    });

    it('returns true for valid 21-word mnemonic', () => {
      const valid21Word =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon admit';
      expect(isValidMnemonic(valid21Word)).toBe(true);
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

  describe('generateMnemonic', () => {
    it('generates valid 12-word mnemonic by default', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it('generates valid 12-word mnemonic with strength 128', () => {
      const mnemonic = generateMnemonic(128);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it('generates valid 24-word mnemonic with strength 256', () => {
      const mnemonic = generateMnemonic(256);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(24);
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it('generates different mnemonics on each call', () => {
      const mnemonic1 = generateMnemonic();
      const mnemonic2 = generateMnemonic();
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('mnemonicToSeed', () => {
    it('converts valid 12-word mnemonic to 32-byte hex seed', async () => {
      const seed = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      expect(seed).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/u.test(seed)).toBe(true);
    });

    it('converts valid 24-word mnemonic to 32-byte hex seed', async () => {
      const seed = await mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      expect(seed).toHaveLength(64);
      expect(/^[0-9a-f]+$/u.test(seed)).toBe(true);
    });

    it('converts valid 15-word mnemonic to 32-byte hex seed', async () => {
      const valid15Word =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon address';
      const seed = await mnemonicToSeed(valid15Word);
      expect(seed).toHaveLength(64);
      expect(/^[0-9a-f]+$/u.test(seed)).toBe(true);
    });

    it('produces same seed for same 12-word mnemonic', async () => {
      const seed1 = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      const seed2 = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      expect(seed1).toBe(seed2);
    });

    it('produces same seed for same 24-word mnemonic', async () => {
      const seed1 = await mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      const seed2 = await mnemonicToSeed(VALID_24_WORD_MNEMONIC);
      expect(seed1).toBe(seed2);
    });

    it('produces different seeds for different mnemonics', async () => {
      const differentMnemonic =
        'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
      const seed1 = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      const seed2 = await mnemonicToSeed(differentMnemonic);
      expect(seed1).not.toBe(seed2);
    });

    it('throws for invalid mnemonic', async () => {
      await expect(mnemonicToSeed('invalid mnemonic')).rejects.toThrow(
        'Invalid BIP39 mnemonic',
      );
    });

    // Verify we're using standard BIP39 PBKDF2 derivation by checking known test vectors
    // Test vector from https://github.com/trezor/python-mnemonic/blob/master/vectors.json
    it('produces correct seed for known test vector (PBKDF2)', async () => {
      // "abandon" x11 + "about" with empty passphrase should produce this seed
      const seed = await mnemonicToSeed(VALID_12_WORD_MNEMONIC);
      // First 32 bytes of the standard BIP39 seed for this mnemonic
      // Full 64-byte seed starts with: 5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4
      expect(seed).toBe(
        '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc1',
      );
    });
  });

  describe('generateMnemonic + mnemonicToSeed integration', () => {
    it('generated mnemonic produces deterministic seed', async () => {
      const mnemonic = generateMnemonic();
      const seed1 = await mnemonicToSeed(mnemonic);
      const seed2 = await mnemonicToSeed(mnemonic);
      expect(seed1).toBe(seed2);
    });

    it('different generated mnemonics produce different seeds', async () => {
      const mnemonic1 = generateMnemonic();
      const mnemonic2 = generateMnemonic();
      const seed1 = await mnemonicToSeed(mnemonic1);
      const seed2 = await mnemonicToSeed(mnemonic2);
      expect(seed1).not.toBe(seed2);
    });
  });
});
