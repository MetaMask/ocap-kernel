import { AES_GCM } from '@libp2p/crypto/ciphers';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { KVStore } from '@metamask/kernel-store';
import { toHex, fromHex } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import { base58btc } from 'multiformats/bases/base58';

import type { KernelStore } from './store/index.ts';
import type {
  PlatformServices,
  RemoteComms,
  RemoteMessageHandler,
} from './types.ts';

export type OcapURLParts = {
  oid: string;
  host: string;
  hints: string[];
};

/**
 * Break down an ocap URL string into its constituent parts.
 *
 * @param ocapURL - The ocap URL to be parsed.
 *
 * @returns an object containing the parsed out elements of `ocapURL`.
 * @throws if `ocapURL` is not a well-formed ocap URL.
 */
export function parseOcapURL(ocapURL: string): OcapURLParts {
  const ref = URL.parse(ocapURL);
  if (!ref) {
    throw Error('unparseable URL');
  }
  if (ref.protocol !== 'ocap:') {
    throw Error('not an ocap URL');
  }
  const parts = ref.pathname.split('@');
  if (parts.length !== 2) {
    throw Error('bad ocap URL');
  }
  const [oid, where] = parts;
  if (!where || !oid) {
    throw Error('bad ocap URL');
  }
  const [host, ...hints] = where.split(',');
  if (!host) {
    throw Error('bad ocap URL');
  }
  return {
    oid,
    host,
    hints,
  };
}

/**
 * Generate the information needed for a network identity.
 *
 * @param seedString - Hex string containing the key seed, or leave undefined to
 *   generate a new random key.
 *
 * @returns pair of the peer id corresponding to the given key, and the seed string.
 */
async function generateKeyInfo(seedString?: string): Promise<[string, string]> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins, no-param-reassign
  seedString ??= toHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const keyPair = await generateKeyPairFromSeed('Ed25519', fromHex(seedString));
  const peerId = peerIdFromPrivateKey(keyPair).toString();
  return [seedString, peerId];
}

/**
 * Produce a list of known libp2p STUN and TURN servers that can be used for
 * NAT hole punching.
 *
 * @param kv - KVStore in which known relay information is kept
 *
 * @returns an array of multiaddrs of known relay services.
 */
export function getKnownRelays(kv: KVStore): string[] {
  const knownRelays = kv.get('knownRelays');
  if (knownRelays) {
    return JSON.parse(knownRelays);
  }
  return [];
}

// XXX IMPORTANT: All the cryptography here is completely amateur and needs to
// be vetted and most likely overhauled in its entirety by an actual competent
// cryptography expert before being unleashed on an unsuspecting public.

/**
 * Initialize remote communications for this kernel.
 *
 * @param kernelStore - The kernel store, for storing persistent key info.
 * @param platformServices - The platform services, for accessing network I/O
 *   operations that are not available within the web worker that the kernel runs in.
 * @param remoteMessageHandler - Handler to process received inbound communcations.
 * @param relays - The known relays to use for the remote comms object.
 * @param logger - The logger to use.
 *
 * @returns the initialized remote comms object.
 */
export async function initRemoteComms(
  kernelStore: KernelStore,
  platformServices: PlatformServices,
  remoteMessageHandler: RemoteMessageHandler,
  relays?: string[],
  logger?: Logger,
): Promise<RemoteComms> {
  let peerId: string;
  let keySeed: string;
  let ocapURLKey: Uint8Array;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const { kv } = kernelStore;
  if (relays && relays.length > 0) {
    kv.set('knownRelays', JSON.stringify(relays));
  }

  const possiblePeerId = kv.get('peerId');
  if (possiblePeerId) {
    keySeed = kv.getRequired('keySeed');
    peerId = possiblePeerId;
    logger?.log(`comms init: existing peer id: ${peerId}`);
  } else {
    // XXX TODO: Instead of generating a new random seed unconditionally, this
    // function should accept an optional BIP39 keyphrase parameter for the
    // seed, to enable a kernel to recover its identity on a new host.
    [keySeed, peerId] = await generateKeyInfo();
    kv.set('keySeed', keySeed);
    kv.set('peerId', peerId);
    logger?.log(`comms init: new peer id: ${peerId}`);
  }
  const possibleOcapURLKey = kv.get('ocapURLKey');
  if (possibleOcapURLKey) {
    ocapURLKey = fromHex(possibleOcapURLKey);
  } else {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    ocapURLKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    kv.set('ocapURLKey', toHex(ocapURLKey));
  }
  const cipher = AES_GCM.create();

  const knownRelays = relays ?? getKnownRelays(kv);
  logger?.log(`relays: ${JSON.stringify(knownRelays)}`);
  await platformServices.initializeRemoteComms(
    keySeed,
    knownRelays,
    remoteMessageHandler,
  );

  /**
   * Obtain this kernel's peer ID.
   *
   * @returns this kernel's peer ID.
   */
  function getPeerId(): string {
    return peerId;
  }

  /**
   * Transmit a message to a remote kernel.
   *
   * @param to - The peer ID of the intended destination.
   * @param message - The message to send; it is the caller's responsibility to
   *   ensure that the string properly encodes something that the recipient will
   *   understand.
   */
  async function sendRemoteMessage(to: string, message: string): Promise<void> {
    await platformServices.sendRemoteMessage(to, message);
  }

  const KREF_MIN_LEN = 16;

  /**
   * Produce a URL string referencing one of the objects in this kernel.
   *
   * @param kref - The kref of the object in question.
   *
   * @returns a URL that can later be redeemed for the given object reference.
   */
  async function issueOcapURL(kref: string): Promise<string> {
    // the libp2p AESCipher salts the plaintext before encrypting, so not bothering to do that here
    const paddedKref = `${kref.padStart(KREF_MIN_LEN)}`;
    const encodedKref = encoder.encode(paddedKref);
    const rawOid = await cipher.encrypt(encodedKref, ocapURLKey);
    const oid = base58btc.encode(rawOid);
    const ocapURL = `ocap:${oid}@${peerId},${knownRelays.join(',')}`;
    return ocapURL;
  }

  /**
   * Provide the kref encoded by an ocap URL referencing this kernel.
   *
   * @param ocapURL - The URL to be decoded.
   *
   * @returns a promise for the kref encoded by `ocapURL`.
   * @throws if the URL is not local to this kernel.
   */
  async function redeemLocalOcapURL(ocapURL: string): Promise<string> {
    const { oid, host } = parseOcapURL(ocapURL);
    if (host !== peerId) {
      throw Error(`ocapURL from a host that's not me`);
    }
    const rawOid = base58btc.decode(oid);
    let encodedKref: Uint8Array;
    try {
      encodedKref = await cipher.decrypt(rawOid, ocapURLKey);
    } catch (problem) {
      logger?.error(`problem deciphering encoded kref: `, problem);
      throw Error(`ocapURL has bad object reference`);
    }
    const paddedKref = decoder.decode(encodedKref);
    const kref = paddedKref.trim();
    return kref;
  }

  return {
    getPeerId,
    sendRemoteMessage,
    issueOcapURL,
    redeemLocalOcapURL,
  };
}
