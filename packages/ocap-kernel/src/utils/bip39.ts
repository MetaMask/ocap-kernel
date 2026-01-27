/**
 * BIP39 mnemonic utilities for kernel identity backup and recovery.
 *
 * @module bip39
 */

import { toHex, fromHex } from '@metamask/kernel-utils';
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * Validates a BIP39 mnemonic phrase.
 *
 * @param mnemonic - The mnemonic phrase to validate (12 or 24 words).
 * @returns true if the mnemonic is valid, false otherwise.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/**
 * Converts a BIP39 mnemonic phrase to a 32-byte seed (hex string).
 *
 * @param mnemonic - The mnemonic phrase (12 or 24 words).
 * @returns The hex-encoded 32-byte seed derived from the mnemonic.
 * @throws If the mnemonic is invalid.
 */
export function mnemonicToSeed(mnemonic: string): string {
  if (!isValidMnemonic(mnemonic)) {
    throw Error('Invalid BIP39 mnemonic');
  }
  // mnemonicToEntropy returns 16 bytes for 12 words, 32 bytes for 24 words
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  // Pad or use entropy directly depending on length
  // 12-word mnemonic = 128 bits = 16 bytes
  // 24-word mnemonic = 256 bits = 32 bytes
  // For 12-word mnemonics, we double the entropy to get 32 bytes
  const seed =
    entropy.length === 16
      ? new Uint8Array([...entropy, ...entropy])
      : entropy.slice(0, 32);
  return toHex(seed);
}

/**
 * Converts a 32-byte seed (hex string) to a BIP39 mnemonic phrase.
 * Uses the first 16 bytes to generate a 12-word mnemonic.
 *
 * @param seedHex - The hex-encoded seed (32 bytes).
 * @returns A 12-word BIP39 mnemonic phrase.
 * @throws If the seed is not 32 bytes (64 hex characters).
 */
export function seedToMnemonic(seedHex: string): string {
  // Validate hex length first (32 bytes = 64 hex characters)
  if (seedHex.length !== 64) {
    throw Error('Seed must be 32 bytes');
  }
  const seed = fromHex(seedHex);
  // Use first 16 bytes for a 12-word mnemonic
  const entropy = seed.slice(0, 16);
  return entropyToMnemonic(entropy, wordlist);
}
