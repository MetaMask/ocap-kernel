import { Fail } from '@endo/errors';
import type { KVStore } from '@metamask/kernel-store';
import type { Logger } from '@metamask/logger';
import { assert } from '@metamask/superstruct';

import type { LocationHintEntry } from '../types.ts';
import { LocationHintEntryStruct } from '../types.ts';

/**
 * Get methods for managing location-hint entries and remote identity values in
 * the kernel store.
 *
 * @param ctx - Store context subset required by location-hint methods.
 * @param ctx.kv - The key/value store for persistence.
 * @param ctx.logger - Optional logger for diagnostic events.
 * @returns An object with location-hint and remote identity store methods.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getLocationHintMethods(ctx: {
  kv: KVStore;
  logger?: Logger | undefined;
}) {
  const { kv } = ctx;

  /**
   * Parse the knownLocationHints JSON string from storage, wrapping errors with
   * a contextual message.
   *
   * @param raw - The raw JSON string to parse.
   * @returns The parsed value.
   */
  function parseStoredJSON(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw Error(
        `Failed to parse knownLocationHints from store (value may be corrupted): ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  /**
   * Read location-hint entries from storage.
   *
   * @returns The location-hint entries.
   */
  function getLocationHintEntries(): LocationHintEntry[] {
    const raw = kv.get('knownLocationHints');
    if (!raw) {
      return [];
    }

    const parsed: unknown = parseStoredJSON(raw);
    if (!Array.isArray(parsed)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- Fail returns never; throw is needed for TS narrowing
      throw Fail`knownLocationHints must be an array`;
    }

    // Validate each entry against the LocationHintEntry schema (entries
    // deserialized from storage may have been written by an older version or
    // corrupted)
    for (const entry of parsed) {
      assert(
        entry,
        LocationHintEntryStruct,
        'Invalid stored location-hint entry',
      );
    }
    return parsed as LocationHintEntry[];
  }

  /**
   * Persist location-hint entries to storage. Validates each entry against the
   * {@link LocationHintEntryStruct} schema before writing. Callers are
   * responsible for enforcing pool caps (e.g. `maxKnownLocationHints`) before
   * calling this method.
   *
   * @param entries - The location-hint entries to persist.
   */
  function setLocationHintEntries(entries: LocationHintEntry[]): void {
    for (const entry of entries) {
      assert(entry, LocationHintEntryStruct, 'Invalid location-hint entry');
    }
    kv.set('knownLocationHints', JSON.stringify(entries));
  }

  /**
   * Convenience: return only location-hint addresses (for the netlayer, etc.).
   *
   * @returns The location-hint addresses.
   */
  function getKnownLocationHintAddresses(): string[] {
    return getLocationHintEntries().map((entry) => entry.addr);
  }

  // Remote identity KV accessors

  /**
   * Get a remote identity value from the store.
   *
   * @param key - The identity key to retrieve.
   * @returns The stored value, or undefined if not set.
   */
  function getRemoteIdentityValue(
    key: 'peerId' | 'keySeed' | 'ocapURLKey',
  ): string | undefined {
    return kv.get(key);
  }

  /**
   * Get a required remote identity value from the store.
   *
   * @param key - The identity key to retrieve.
   * @returns The stored value.
   * @throws If the key is not set.
   */
  function getRemoteIdentityValueRequired(
    key: 'peerId' | 'keySeed' | 'ocapURLKey',
  ): string {
    return kv.getRequired(key);
  }

  /**
   * Set a remote identity value in the store.
   *
   * @param key - The identity key to set.
   * @param value - The value to store.
   */
  function setRemoteIdentityValue(
    key: 'peerId' | 'keySeed' | 'ocapURLKey',
    value: string,
  ): void {
    kv.set(key, value);
  }

  return {
    getLocationHintEntries,
    setLocationHintEntries,
    getKnownLocationHintAddresses,
    getRemoteIdentityValue,
    getRemoteIdentityValueRequired,
    setRemoteIdentityValue,
  };
}
