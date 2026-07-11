import { toHex, fromHex } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import { deriveNeutralPeerId } from '@metamask/netlayer';
import type { Json } from '@metamask/utils';
import { base58btc } from 'multiformats/bases/base58';

import type { KernelStore, LocationHintEntry } from '../../store/index.ts';
import { insistKRef } from '../../types.ts';
import type { KRef, PlatformServices } from '../../types.ts';
import { mnemonicToSeed } from '../../utils/bip39.ts';
import type {
  RemoteIdentity,
  RemoteComms,
  RemoteMessageHandler,
  OnRemoteGiveUp,
  OnIncarnationChange,
  RemoteCommsOptions,
} from '../types.ts';

export type OcapURLParts = {
  oid: string;
  host: string;
  hints: string[];
};

/**
 * The netlayer selected when a caller omits a specifier. The kernel treats a
 * missing specifier as "use libp2p" during the transition to explicit netlayer
 * selection.
 */
export const DEFAULT_NETLAYER = 'libp2p';

/**
 * Default maximum number of location hints embedded in a single OCAP URL.
 * 3 balances URL length against connectivity resilience — most netlayer
 * topologies have fewer than 3 distinct hints available to a peer.
 */
export const DEFAULT_MAX_URL_LOCATION_HINTS = 3;

/**
 * Default maximum location-hint entries stored in the kernel's hint pool.
 * 20 bounds storage overhead while accommodating typical bootstrap sets
 * (2–5) plus learned hints discovered through peer exchange.
 */
export const DEFAULT_MAX_KNOWN_LOCATION_HINTS = 20;

/**
 * Enforce the location-hint pool cap by prioritizing bootstrap entries, then
 * the newest non-bootstrap entries, up to `cap`. If bootstrap entries alone
 * exceed the cap, the result is truncated to `cap` (some bootstrap entries
 * may be dropped).
 *
 * @param entries - The full set of location-hint entries.
 * @param cap - The maximum pool size.
 * @returns The entries trimmed to the pool cap.
 */
function enforcePoolCap(
  entries: LocationHintEntry[],
  cap: number,
): LocationHintEntry[] {
  if (entries.length <= cap) {
    return entries;
  }
  const bootstrap = entries.filter((entry) => entry.isBootstrap);
  const nonBootstrap = entries
    .filter((entry) => !entry.isBootstrap)
    .sort((a, b) => b.lastSeen - a.lastSeen);
  return [...bootstrap, ...nonBootstrap].slice(0, cap);
}

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
  const [host, ...rawHints] = where.split(',');
  if (!host) {
    throw Error('bad ocap URL');
  }
  const hints = rawHints.filter(Boolean);
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
  const peerId = deriveNeutralPeerId(fromHex(seedString));
  return [seedString, peerId];
}

// XXX IMPORTANT: All the cryptography here is completely amateur and needs to
// be vetted and most likely overhauled in its entirety by an actual competent
// cryptography expert before being unleashed on an unsuspecting public.

/**
 * Initialize the kernel's remote identity (peer ID, crypto keys, OCAP URL
 * operations) without starting any network communications.
 *
 * @param kernelStore - The kernel store, for storing persistent key info.
 * @param [options] - Options for identity initialization.
 * @param [options.bootstrapHints] - Bootstrap location hints. These are merged
 *   into the hint pool, marked as bootstrap (prioritized during eviction and
 *   URL selection), and persisted. Hints previously marked as bootstrap that
 *   are no longer in this list have their bootstrap flag cleared.
 * @param [options.mnemonic] - BIP39 mnemonic for seed recovery.
 * @param [options.maxUrlLocationHints] - Cap on location hints per OCAP URL.
 * @param [options.maxKnownLocationHints] - Cap on the stored hint pool.
 * @param logger - The logger to use.
 * @param keySeed - Optional seed for key generation.
 * @returns the identity object, the key seed, and known location hints.
 */
export async function initRemoteIdentity(
  kernelStore: KernelStore,
  options?: {
    bootstrapHints?: string[] | undefined;
    mnemonic?: string | undefined;
    maxUrlLocationHints?: number | undefined;
    maxKnownLocationHints?: number | undefined;
  },
  logger?: Logger,
  keySeed?: string,
): Promise<{
  identity: RemoteIdentity;
  keySeed: string;
  knownLocationHints: string[];
}> {
  let peerId: string;
  let ocapURLKey: Uint8Array;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bootstrapHints = options?.bootstrapHints ?? [];
  const mnemonic = options?.mnemonic;
  const maxUrlLocationHints =
    options?.maxUrlLocationHints ?? DEFAULT_MAX_URL_LOCATION_HINTS;
  const maxKnownLocationHints =
    options?.maxKnownLocationHints ?? DEFAULT_MAX_KNOWN_LOCATION_HINTS;

  if (
    !Number.isInteger(maxUrlLocationHints) ||
    maxUrlLocationHints < 1 ||
    !Number.isInteger(maxKnownLocationHints) ||
    maxKnownLocationHints < 1
  ) {
    throw Error(
      `maxUrlLocationHints (${maxUrlLocationHints}) and maxKnownLocationHints (${maxKnownLocationHints}) must be positive integers`,
    );
  }

  if (bootstrapHints.length > 0) {
    // Date.now() works here because this code runs in the start compartment,
    // which retains the original Date constructor (%InitialDate%).
    const now = Date.now();
    const bootstrapSet = new Set(bootstrapHints);

    if (bootstrapHints.length > maxKnownLocationHints) {
      logger?.log(
        `location-hint init: bootstrap hint count (${bootstrapHints.length}) exceeds maxKnownLocationHints (${maxKnownLocationHints}); pool will be truncated`,
      );
    }

    // Merge with existing entries: mark bootstrap hints, preserve learned ones
    const existing = kernelStore.getLocationHintEntries();
    const byAddr = new Map(existing.map((entry) => [entry.addr, entry]));
    for (const addr of bootstrapHints) {
      // Bootstrap hints always get a fresh lastSeen timestamp on (re-)init
      byAddr.set(addr, { addr, lastSeen: now, isBootstrap: true });
    }
    // Clear bootstrap flag on entries no longer in the current bootstrap set
    // (create new objects to follow immutability conventions)
    for (const [addr, entry] of byAddr.entries()) {
      if (entry.isBootstrap && !bootstrapSet.has(addr)) {
        byAddr.set(addr, { ...entry, isBootstrap: false });
      }
    }
    const preCapCount = byAddr.size;
    const merged = enforcePoolCap([...byAddr.values()], maxKnownLocationHints);
    if (merged.length < preCapCount) {
      logger?.log(
        `location-hint init: evicted ${preCapCount - merged.length} hints to enforce pool cap (${maxKnownLocationHints})`,
      );
    }
    kernelStore.setLocationHintEntries(merged);
  }

  /* eslint-disable no-param-reassign */
  const possiblePeerId = kernelStore.getRemoteIdentityValue('peerId');
  if (possiblePeerId) {
    // If a mnemonic is provided but identity already exists, throw an error
    // to avoid silently using a different identity than expected
    if (mnemonic) {
      throw Error(
        'Cannot use mnemonic: kernel identity already exists. Use resetStorage to clear existing identity first.',
      );
    }
    keySeed = kernelStore.getRemoteIdentityValueRequired('keySeed');
    peerId = possiblePeerId;
    logger?.log(`comms init: existing peer id: ${peerId}`);
  } else {
    // If a mnemonic is provided, derive the seed from it
    if (mnemonic) {
      keySeed = await mnemonicToSeed(mnemonic);
      logger?.log('comms init: using mnemonic for seed recovery');
    }
    [keySeed, peerId] = await generateKeyInfo(keySeed);
    kernelStore.setRemoteIdentityValue('keySeed', keySeed);
    kernelStore.setRemoteIdentityValue('peerId', peerId);
    logger?.log(`comms init: new peer id: ${peerId}`);
  }
  const possibleOcapURLKey = kernelStore.getRemoteIdentityValue('ocapURLKey');
  if (possibleOcapURLKey) {
    ocapURLKey = fromHex(possibleOcapURLKey);
  } else {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    ocapURLKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    kernelStore.setRemoteIdentityValue('ocapURLKey', toHex(ocapURLKey));
  }
  /* eslint-enable no-param-reassign */

  const KREF_MIN_LEN = 16;
  const AES_GCM_IV_LENGTH = 12;

  // Import the 32-byte ocapURLKey as a non-extractable AES-256-GCM key. The key
  // is already 32 random bytes, so it is used directly with no PBKDF2 stretching
  // (unlike the libp2p AESCipher this replaced). Import lazily and memoize so
  // identities that never issue/redeem a URL never touch crypto.subtle.
  // `CryptoKey` is flagged as experimental for the configured Node range but is
  // present in every runtime this code targets (kernel worker + Node ≥ 20).
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  let aesKeyPromise: Promise<CryptoKey> | undefined;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const getAesKey = async (): Promise<CryptoKey> => {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    aesKeyPromise ??= globalThis.crypto.subtle.importKey(
      'raw',
      ocapURLKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    return aesKeyPromise;
  };

  /**
   * Obtain this kernel's peer ID.
   *
   * @returns this kernel's peer ID.
   */
  function getPeerId(): string {
    return peerId;
  }

  /**
   * Produce a URL string referencing one of the objects in this kernel.
   *
   * @param kref - The kref of the object in question.
   *
   * @returns a URL that can later be redeemed for the given object reference.
   */
  async function issueOcapURL(kref: KRef): Promise<string> {
    // Pad short krefs to KREF_MIN_LEN so the ciphertext length does not leak the
    // kref length. A fresh random 12-byte IV per encryption provides semantic
    // security (the previous libp2p AESCipher salted the plaintext instead).
    const paddedKref = `${kref.padStart(KREF_MIN_LEN)}`;
    const encodedKref = encoder.encode(paddedKref);
    const aesKey = await getAesKey();
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const iv = globalThis.crypto.getRandomValues(
      new Uint8Array(AES_GCM_IV_LENGTH),
    );
    const ciphertext = new Uint8Array(
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encodedKref,
      ),
    );
    const rawOid = new Uint8Array(iv.length + ciphertext.length);
    rawOid.set(iv, 0);
    rawOid.set(ciphertext, iv.length);
    const oid = base58btc.encode(rawOid);
    const entries = kernelStore.getLocationHintEntries();
    // Select top hints: bootstrap first (operator-configured, most reliable),
    // then most recently seen (likeliest to be online)
    const sorted = [...entries].sort((a, b) => {
      if (a.isBootstrap !== b.isBootstrap) {
        return a.isBootstrap ? -1 : 1;
      }
      return b.lastSeen - a.lastSeen;
    });
    const selected = sorted
      .slice(0, maxUrlLocationHints)
      .map((entry) => entry.addr);
    const hintSuffix = selected.length > 0 ? `,${selected.join(',')}` : '';
    const ocapURL = `ocap:${oid}@${peerId}${hintSuffix}`;
    return ocapURL;
  }

  /**
   * Add location hints to the kernel's known hint pool.
   * Deduplicates, updates lastSeen on re-observation, and enforces
   * the configured `maxKnownLocationHints` cap by evicting the oldest
   * non-bootstrap entries.
   *
   * @param newHints - Location hints to add.
   */
  function addKnownLocationHints(newHints: string[]): void {
    if (newHints.length === 0) {
      return;
    }
    // Date.now() works here because this code runs in the start compartment,
    // which retains the original Date constructor (%InitialDate%).
    const now = Date.now();
    const existing = kernelStore.getLocationHintEntries();
    const byAddr = new Map(existing.map((entry) => [entry.addr, entry]));
    let changed = false;

    for (const addr of newHints) {
      const entry = byAddr.get(addr);
      if (entry) {
        // Update lastSeen on re-observation (create new object to follow
        // immutability conventions)
        if (entry.lastSeen !== now) {
          byAddr.set(addr, { ...entry, lastSeen: now });
          changed = true;
        }
      } else {
        byAddr.set(addr, { addr, lastSeen: now, isBootstrap: false });
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    const preCapCount = byAddr.size;
    const capped = enforcePoolCap([...byAddr.values()], maxKnownLocationHints);
    if (capped.length < preCapCount) {
      logger?.log(
        `addKnownLocationHints: evicted ${preCapCount - capped.length} hints to enforce pool cap (${maxKnownLocationHints})`,
      );
    }
    kernelStore.setLocationHintEntries(capped);
  }

  /**
   * Provide the kref encoded by an ocap URL referencing this kernel.
   *
   * @param ocapURL - The URL to be decoded.
   *
   * @returns a promise for the kref encoded by `ocapURL`.
   * @throws if the URL is not local to this kernel.
   */
  async function redeemLocalOcapURL(ocapURL: string): Promise<KRef> {
    const { oid, host } = parseOcapURL(ocapURL);
    if (host !== peerId) {
      throw Error(`ocapURL from a host that's not me`);
    }
    const rawOid = base58btc.decode(oid);
    let encodedKref: Uint8Array;
    try {
      const iv = rawOid.subarray(0, AES_GCM_IV_LENGTH);
      const ciphertext = rawOid.subarray(AES_GCM_IV_LENGTH);
      const aesKey = await getAesKey();
      encodedKref = new Uint8Array(
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          aesKey,
          ciphertext,
        ),
      );
    } catch (problem) {
      logger?.error(`problem deciphering encoded kref: `, problem);
      throw Error(`ocapURL has bad object reference`);
    }
    const paddedKref = decoder.decode(encodedKref);
    const kref = paddedKref.trim();
    insistKRef(kref);
    return kref;
  }

  return harden({
    identity: harden({
      getPeerId,
      issueOcapURL,
      redeemLocalOcapURL,
      addKnownLocationHints,
    }),
    keySeed,
    knownLocationHints: kernelStore.getKnownLocationHintAddresses(),
  });
}

/**
 * Initialize remote communications for this kernel.
 *
 * @param kernelStore - The kernel store, for storing persistent key info.
 * @param platformServices - The platform services, for accessing network I/O
 *   operations that are not available within the web worker that the kernel runs in.
 * @param remoteMessageHandler - Handler to process received inbound communications.
 * @param options - Options for remote communications initialization.
 * @param logger - The logger to use.
 * @param keySeed - Optional seed for libp2p key generation.
 * @param onRemoteGiveUp - Optional callback to be called when we give up on a remote.
 * @param incarnationId - Unique identifier for this kernel instance.
 * @param onIncarnationChange - Optional callback when a remote peer's incarnation changes.
 *
 * @returns the initialized remote comms object.
 */
export async function initRemoteComms(
  kernelStore: KernelStore,
  platformServices: PlatformServices,
  remoteMessageHandler: RemoteMessageHandler,
  options: RemoteCommsOptions = {},
  logger?: Logger,
  keySeed?: string,
  onRemoteGiveUp?: OnRemoteGiveUp,
  incarnationId?: string,
  onIncarnationChange?: OnIncarnationChange,
): Promise<RemoteComms> {
  const { specifier, mnemonic, maxUrlLocationHints, maxKnownLocationHints } =
    options;
  const netlayer = specifier?.netlayer ?? DEFAULT_NETLAYER;
  const specifierConfig = specifier?.config;
  const config: Record<string, Json> =
    specifierConfig !== null &&
    typeof specifierConfig === 'object' &&
    !Array.isArray(specifierConfig)
      ? { ...specifierConfig }
      : {};

  // By convention the kernel understands exactly one netlayer-config key —
  // `knownRelays: string[]` — which it treats as the opaque hint pool it
  // persists and re-injects. Bootstrap hints the caller supplied travel there.
  const bootstrapHints = Array.isArray(config.knownRelays)
    ? config.knownRelays.filter(
        (hint): hint is string => typeof hint === 'string',
      )
    : [];

  const result = await initRemoteIdentity(
    kernelStore,
    {
      bootstrapHints,
      mnemonic,
      maxUrlLocationHints,
      maxKnownLocationHints,
    },
    logger,
    keySeed,
  );

  const { identity, knownLocationHints } = result;

  // Overwrite with the full persisted pool the store now owns. `knownRelays`
  // is the libp2p netlayer's config key by convention (see the note above);
  // the kernel-generic pool it carries is a set of opaque location hints.
  config.knownRelays = knownLocationHints;

  logger?.log(`location hints: ${JSON.stringify(knownLocationHints)}`);

  // detectWake() reads and updates lastActiveTime atomically, so it must be
  // called before initializeRemoteComms to capture the pre-restart timestamp.
  const wakeDetected = kernelStore.detectWake();

  // `mnemonic` (sensitive key material) is never placed in `specifier.config`.
  await platformServices.initializeRemoteComms({
    keySeed: result.keySeed,
    specifier: { netlayer, config },
    hooks: {
      handleMessage: remoteMessageHandler,
      ...(onRemoteGiveUp && { onRemoteGiveUp }),
      ...(onIncarnationChange && { onIncarnationChange }),
    },
    ...(incarnationId !== undefined && { incarnationId }),
  });

  if (wakeDetected) {
    logger?.log('Cross-incarnation wake detected, resetting backoffs');
    await platformServices.resetAllBackoffs();
  }

  /**
   * Transmit a message to a remote kernel.
   *
   * @param to - The peer ID of the intended destination.
   * @param message - The serialized message string (with seq/ack already added by RemoteHandle).
   */
  async function sendRemoteMessage(to: string, message: string): Promise<void> {
    await platformServices.sendRemoteMessage(to, message);
  }

  return {
    ...identity,
    sendRemoteMessage,
    registerLocationHints:
      platformServices.registerLocationHints.bind(platformServices),
  };
}
