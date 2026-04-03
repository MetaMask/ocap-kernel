import type { KVStore } from '@metamask/kernel-store';

import {
  insistEndpointId,
  insistKRef,
  insistSubclusterId,
} from '../../types.ts';
import type { EndpointId, KRef, SubclusterId } from '../../types.ts';

/**
 * Validate that a raw string is a valid KRef and return it branded.
 *
 * @param raw - The raw string to validate.
 * @returns The validated KRef.
 */
export function readKRef(raw: string): KRef {
  insistKRef(raw);
  return raw;
}

/**
 * Read an optional KRef from the KV store with validation.
 *
 * @param kv - The KV store to read from.
 * @param key - The key to look up.
 * @returns The validated KRef, or undefined if the key is not set.
 */
export function readOptionalKRef(kv: KVStore, key: string): KRef | undefined {
  const raw = kv.get(key);
  if (raw === undefined) {
    return undefined;
  }
  insistKRef(raw);
  return raw;
}

/**
 * Read a required KRef from the KV store with validation.
 *
 * @param kv - The KV store to read from.
 * @param key - The key to look up.
 * @returns The validated KRef.
 */
export function readRequiredKRef(kv: KVStore, key: string): KRef {
  const raw = kv.getRequired(key);
  insistKRef(raw);
  return raw;
}

/**
 * Read an optional EndpointId from the KV store with validation.
 *
 * @param kv - The KV store to read from.
 * @param key - The key to look up.
 * @returns The validated EndpointId, or undefined if the key is not set.
 */
export function readOptionalEndpointId(
  kv: KVStore,
  key: string,
): EndpointId | undefined {
  const raw = kv.get(key);
  if (raw === undefined) {
    return undefined;
  }
  insistEndpointId(raw);
  return raw;
}

/**
 * Read an optional SubclusterId from the KV store with validation.
 *
 * @param kv - The KV store to read from.
 * @param key - The key to look up.
 * @returns The validated SubclusterId, or undefined if the key is not set.
 */
export function readOptionalSubclusterId(
  kv: KVStore,
  key: string,
): SubclusterId | undefined {
  const raw = kv.get(key);
  if (raw === undefined) {
    return undefined;
  }
  insistSubclusterId(raw);
  return raw;
}
