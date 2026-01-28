/**
 * BIP39 mnemonic utilities for kernel identity backup and recovery.
 *
 * @module bip39
 */

import { toHex } from '@metamask/kernel-utils';
import {
  generateMnemonic as generateMnemonicInternal,
  mnemonicToSeed as mnemonicToSeedInternal,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * Validates a BIP39 mnemonic phrase.
 *
 * @param mnemonic - The mnemonic phrase to validate (12, 15, 18, 21, or 24 words).
 * @returns true if the mnemonic is valid, false otherwise.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * Generates a new random BIP39 mnemonic phrase.
 *
 * @param strength - The entropy strength in bits. 128 = 12 words, 256 = 24 words.
 *   Defaults to 128 (12 words).
 * @returns A new random mnemonic phrase.
 */
export function generateMnemonic(strength: 128 | 256 = 128): string {
  return generateMnemonicInternal(wordlist, strength);
}

/**
 * Converts a BIP39 mnemonic phrase to a 32-byte seed using standard PBKDF2 derivation.
 *
 * This uses the standard BIP39 key derivation with PBKDF2-HMAC-SHA512 (2048 iterations)
 * to derive a 512-bit seed, then returns the first 32 bytes for Ed25519 key generation.
 *
 * Note: This is a one-way derivation. You cannot reverse a seed back to its mnemonic.
 * To enable backup/recovery, store the original mnemonic or use {@link generateMnemonic}
 * to create a new mnemonic before initializing the kernel.
 *
 * @param mnemonic - The mnemonic phrase (any valid BIP39 length: 12, 15, 18, 21, or 24 words).
 * @returns A promise for the hex-encoded 32-byte seed derived from the mnemonic.
 * @throws If the mnemonic is invalid.
 */
export async function mnemonicToSeed(mnemonic: string): Promise<string> {
  if (!isValidMnemonic(mnemonic)) {
    throw Error('Invalid BIP39 mnemonic');
  }
  // Standard BIP39: PBKDF2-HMAC-SHA512 with 2048 iterations produces 512-bit seed
  const seed512 = await mnemonicToSeedInternal(mnemonic, '');
  // Use first 32 bytes for Ed25519 key generation
  return toHex(seed512.slice(0, 32));
}
