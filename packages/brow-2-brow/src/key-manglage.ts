import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import type { PrivateKey } from '@libp2p/interface';

/**
 * Convert a Uint8Array into a hex string.
 *
 * @param arr - The bytes to convert.
 *
 * @returns `arr` represented as a hex string.
 */
export function toHex(arr: Uint8Array): string {
  let result = '';
  for (const byte of arr) {
    const byteHex = byte.toString(16);
    result += byteHex.length === 1 ? `0${byteHex}` : byteHex;
  }
  return result;
}

/**
 * Convert a hex string into a Uint8Array.
 *
 * @param str - The string to convert.
 *
 * @returns the bytes described by `str`.
 */
export function fromHex(str: string): Uint8Array {
  const len = str.length;
  const resultLen = len / 2;
  const bytes = new Uint8Array(resultLen);
  let inIdx = 0;
  let outIdx = 0;
  while (outIdx < resultLen) {
    const digits = str.slice(inIdx, inIdx + 2);
    bytes[outIdx] = parseInt(digits, 16);
    outIdx += 2;
    inIdx += 2;
  }
  return bytes;
}

// seed: 1 peerId: 12D3KooWPjceQrSwdWXPyLLeABRXmuqt69Rg3sBYbU1Nft9HyQ6X
// seed: 2 peerId: 12D3KooWH3uVF6wv47WnArKHk5p6cvgCJEb74UTmxztmQDc298L3
// seed: 3 peerId: 12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo
// seed: 4 peerId: 12D3KooWLJtG8fd2hkQzTn96MrLvThmnNQjTUFZwGEsLRz5EmSzc
// seed: 5 peerId: 12D3KooWSHj3RRbBjD15g6wekV8y3mm57Pobmps2g2WJm6F67Lay

/**
 * Generate the private key for a given localID.
 *
 * @param localId - The localID whose peerID is sought.
 *
 * @returns the private key for `localID`.
 */
export async function generateKeyPair(localId: number): Promise<PrivateKey> {
  let seed;
  if (localId > 0 && localId < 256) {
    seed = new Uint8Array(32);
    seed[0] = localId;
  } else {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    seed = globalThis.crypto.getRandomValues(new Uint8Array(32));
  }
  return await generateKeyPairFromSeed('Ed25519', seed);
  // const peerId = peerIdFromPrivateKey(keyPair);
  // return peerId;
}
