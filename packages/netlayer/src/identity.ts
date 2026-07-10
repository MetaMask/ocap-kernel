import { ed25519 } from '@noble/curves/ed25519';
import { base58btc } from 'multiformats/bases/base58';

/** Length in bytes of a raw Ed25519 public key. */
const ED25519_PUBLIC_KEY_LENGTH = 32;

/**
 * Derive a netlayer-neutral peer id from a raw Ed25519 seed.
 *
 * The peer id is the multibase (base58btc, `z` prefix) encoding of the raw
 * 32-byte Ed25519 public key. Derivation is deterministic from the seed, so the
 * same seed always yields the same peer id — this is what preserves mnemonic
 * recovery across the identity layer.
 *
 * @param seed - The 32-byte Ed25519 seed.
 * @returns The neutral peer id: multibase (base58btc) of the raw public key.
 */
export function deriveNeutralPeerId(seed: Uint8Array): string {
  const publicKey = ed25519.getPublicKey(seed);
  return base58btc.encode(publicKey);
}

/**
 * Recover the raw Ed25519 public key from a neutral peer id.
 *
 * @param peerId - A neutral peer id produced by {@link deriveNeutralPeerId}.
 * @returns The raw 32-byte public key.
 * @throws if `peerId` is not a base58btc multibase string of the right length.
 */
export function neutralPeerIdToPublicKey(peerId: string): Uint8Array {
  const raw = base58btc.decode(peerId);
  if (raw.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw Error(`invalid neutral peer id length: ${raw.length}`);
  }
  return raw;
}

/**
 * Encode a raw Ed25519 public key as a neutral peer id.
 *
 * @param publicKey - The raw 32-byte public key.
 * @returns The neutral peer id.
 */
export function publicKeyToNeutralPeerId(publicKey: Uint8Array): string {
  return base58btc.encode(publicKey);
}
