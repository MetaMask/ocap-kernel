import { describe, it, expect } from 'vitest';

import { encryptMnemonic, decryptMnemonic } from './mnemonic-crypto.ts';
import type { EncryptedMnemonicData } from './mnemonic-crypto.ts';

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const TEST_PASSWORD = 'my-secret-password';
const TEST_SALT = 'deadbeefdeadbeefdeadbeefdeadbeef';
// Use fast PBKDF2 iterations for testing. Production uses 600,000.
const TEST_PBKDF2_ITERATIONS = 1_000;

describe('mnemonic-crypto', () => {
  describe('encryptMnemonic / decryptMnemonic', () => {
    it('roundtrips with correct password', () => {
      const encrypted = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.ciphertext).not.toBe('');
      expect(encrypted.nonce).not.toBe('');
      expect(encrypted.salt).not.toBe('');

      const decrypted = decryptMnemonic({
        data: encrypted,
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(decrypted).toBe(TEST_MNEMONIC);
    });

    it('roundtrips with caller-provided salt', () => {
      const encrypted = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        salt: TEST_SALT,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(encrypted.salt).toBe(TEST_SALT);

      const decrypted = decryptMnemonic({
        data: encrypted,
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(decrypted).toBe(TEST_MNEMONIC);
    });

    it('throws on decrypt with wrong password', () => {
      const encrypted = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(() =>
        decryptMnemonic({
          data: encrypted,
          password: 'wrong-password',
          pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
        }),
      ).toThrow(/invalid.*tag|decrypt/iu);
    });

    it('produces deterministic output for same password and salt', () => {
      const a = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        salt: TEST_SALT,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });
      const b = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        salt: TEST_SALT,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(a).toStrictEqual(b);
    });

    it('produces different output for different passwords with same salt', () => {
      const a = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: 'password-a',
        salt: TEST_SALT,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });
      const b = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: 'password-b',
        salt: TEST_SALT,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    it('stores all fields as hex strings', () => {
      const encrypted = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        salt: TEST_SALT,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      expect(encrypted.ciphertext).toMatch(/^[\da-f]+$/u);
      expect(encrypted.nonce).toMatch(/^[\da-f]+$/u);
      expect(encrypted.salt).toMatch(/^[\da-f]+$/u);
      expect(encrypted.nonce).toHaveLength(24); // 12 bytes = 24 hex chars
    });

    it('handles empty mnemonic', () => {
      const encrypted = encryptMnemonic({
        mnemonic: '',
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });
      const decrypted = decryptMnemonic({
        data: encrypted,
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });
      expect(decrypted).toBe('');
    });

    it('rejects tampered ciphertext', () => {
      const encrypted = encryptMnemonic({
        mnemonic: TEST_MNEMONIC,
        password: TEST_PASSWORD,
        pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
      });

      const tampered: EncryptedMnemonicData = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.replace(/^.{2}/u, 'ff'),
      };

      expect(() =>
        decryptMnemonic({
          data: tampered,
          password: TEST_PASSWORD,
          pbkdf2Iterations: TEST_PBKDF2_ITERATIONS,
        }),
      ).toThrow(/invalid.*tag|decrypt/iu);
    });
  });
});
