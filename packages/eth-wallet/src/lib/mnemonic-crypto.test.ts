import { describe, it, expect } from 'vitest';

import { encryptMnemonic, decryptMnemonic } from './mnemonic-crypto.ts';
import type { EncryptedMnemonicData } from './mnemonic-crypto.ts';

const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const TEST_PASSWORD = 'my-secret-password';
const TEST_SALT = 'deadbeefdeadbeefdeadbeefdeadbeef';

describe('mnemonic-crypto', () => {
  describe('encryptMnemonic / decryptMnemonic', () => {
    // PBKDF2 with 600k iterations is slow under coverage instrumentation.
    const KDF_TIMEOUT = 900_000;

    it(
      'roundtrips with correct password',
      () => {
        const encrypted = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
        });

        expect(encrypted.encrypted).toBe(true);
        expect(encrypted.ciphertext).not.toBe('');
        expect(encrypted.nonce).not.toBe('');
        expect(encrypted.salt).not.toBe('');

        const decrypted = decryptMnemonic({
          data: encrypted,
          password: TEST_PASSWORD,
        });

        expect(decrypted).toBe(TEST_MNEMONIC);
      },
      KDF_TIMEOUT,
    );

    it(
      'roundtrips with caller-provided salt',
      () => {
        const encrypted = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
          salt: TEST_SALT,
        });

        expect(encrypted.salt).toBe(TEST_SALT);

        const decrypted = decryptMnemonic({
          data: encrypted,
          password: TEST_PASSWORD,
        });

        expect(decrypted).toBe(TEST_MNEMONIC);
      },
      KDF_TIMEOUT,
    );

    it(
      'throws on decrypt with wrong password',
      () => {
        const encrypted = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
        });

        expect(() =>
          decryptMnemonic({ data: encrypted, password: 'wrong-password' }),
        ).toThrow(/invalid.*tag|decrypt/iu);
      },
      KDF_TIMEOUT,
    );

    it(
      'produces deterministic output for same password and salt',
      () => {
        const a = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
          salt: TEST_SALT,
        });
        const b = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
          salt: TEST_SALT,
        });

        expect(a).toStrictEqual(b);
      },
      KDF_TIMEOUT,
    );

    it(
      'produces different output for different passwords with same salt',
      () => {
        const a = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: 'password-a',
          salt: TEST_SALT,
        });
        const b = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: 'password-b',
          salt: TEST_SALT,
        });

        expect(a.ciphertext).not.toBe(b.ciphertext);
      },
      KDF_TIMEOUT,
    );

    it(
      'stores all fields as hex strings',
      () => {
        const encrypted = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
          salt: TEST_SALT,
        });

        expect(encrypted.ciphertext).toMatch(/^[\da-f]+$/u);
        expect(encrypted.nonce).toMatch(/^[\da-f]+$/u);
        expect(encrypted.salt).toMatch(/^[\da-f]+$/u);
        expect(encrypted.nonce).toHaveLength(24); // 12 bytes = 24 hex chars
      },
      KDF_TIMEOUT,
    );

    it(
      'handles empty mnemonic',
      () => {
        const encrypted = encryptMnemonic({
          mnemonic: '',
          password: TEST_PASSWORD,
        });
        const decrypted = decryptMnemonic({
          data: encrypted,
          password: TEST_PASSWORD,
        });
        expect(decrypted).toBe('');
      },
      KDF_TIMEOUT,
    );

    it(
      'rejects tampered ciphertext',
      () => {
        const encrypted = encryptMnemonic({
          mnemonic: TEST_MNEMONIC,
          password: TEST_PASSWORD,
        });

        const tampered: EncryptedMnemonicData = {
          ...encrypted,
          ciphertext: encrypted.ciphertext.replace(/^.{2}/u, 'ff'),
        };

        expect(() =>
          decryptMnemonic({ data: tampered, password: TEST_PASSWORD }),
        ).toThrow(/invalid.*tag|decrypt/iu);
      },
      KDF_TIMEOUT,
    );
  });
});
