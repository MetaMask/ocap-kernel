import { fromHex } from '@metamask/kernel-utils';
import { base58btc } from 'multiformats/bases/base58';
import { describe, it, expect } from 'vitest';

import {
  deriveNeutralPeerId,
  neutralPeerIdToPublicKey,
  publicKeyToNeutralPeerId,
} from './identity.ts';

describe('identity', () => {
  describe('deriveNeutralPeerId', () => {
    it.each([
      {
        label: 'all-zero seed',
        seed: '00'.repeat(32),
        // Ed25519 public key of the all-zero seed is
        // 3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29.
        expected: 'z4zvwRjXUKGfvwnParsHAS3HuSVzV5cA4McphgmoCtajS',
      },
      {
        label: 'all-one seed',
        seed: '01'.repeat(32),
        expected: 'zAKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9',
      },
    ])('derives a stable neutral peer id from $label', ({ seed, expected }) => {
      expect(deriveNeutralPeerId(fromHex(seed))).toBe(expected);
    });

    it('produces multibase base58btc ids (z prefix)', () => {
      expect(deriveNeutralPeerId(fromHex('02'.repeat(32)))).toMatch(/^z/u);
    });

    it('derives different ids for different seeds', () => {
      expect(deriveNeutralPeerId(fromHex('00'.repeat(32)))).not.toBe(
        deriveNeutralPeerId(fromHex('01'.repeat(32))),
      );
    });
  });

  describe('neutralPeerIdToPublicKey', () => {
    it('round-trips a derived peer id back to its raw public key', () => {
      const seed = fromHex('03'.repeat(32));
      const peerId = deriveNeutralPeerId(seed);
      const publicKey = neutralPeerIdToPublicKey(peerId);
      expect(publicKey).toHaveLength(32);
      expect(publicKeyToNeutralPeerId(publicKey)).toBe(peerId);
    });

    it('throws for a wrong-length input', () => {
      const tooShort = base58btc.encode(new Uint8Array(16));
      expect(() => neutralPeerIdToPublicKey(tooShort)).toThrow(
        'invalid neutral peer id length: 16',
      );
    });
  });

  describe('publicKeyToNeutralPeerId', () => {
    it('encodes a raw public key as the same id derive produces', () => {
      const seed = fromHex('04'.repeat(32));
      const peerId = deriveNeutralPeerId(seed);
      const publicKey = neutralPeerIdToPublicKey(peerId);
      expect(publicKeyToNeutralPeerId(publicKey)).toBe(peerId);
    });
  });
});
