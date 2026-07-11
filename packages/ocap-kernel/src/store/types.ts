import type { KVStore } from '@metamask/kernel-store';
import type { Logger } from '@metamask/logger';
import { object, string, number, boolean, refine } from '@metamask/superstruct';

import type { KRef, RunQueueItemNotify, RunQueueItemSend } from '../types.ts';

export type CrankBufferItem = RunQueueItemSend | RunQueueItemNotify;

export type StoreContext = {
  kv: KVStore;
  runQueue: StoredQueue; // Holds RunAction[]
  runQueueLengthCache: number; // Holds number
  refreshRunQueue: () => void;
  nextObjectId: StoredValue; // Holds string
  nextPromiseId: StoredValue; // Holds string
  nextVatId: StoredValue; // Holds string
  nextRemoteId: StoredValue; // Holds string
  maybeFreeKrefs: Set<KRef>;
  gcActions: StoredValue; // Holds GCAction[]
  reapQueue: StoredValue; // Holds ReapAction[]
  terminatedVats: StoredValue; // Holds VatId[]
  inCrank: boolean;
  crankSettled?: Promise<void>;
  resolveCrank?: (() => void) | undefined;
  savepoints: string[];
  crankBuffer: CrankBufferItem[]; // Buffer for sends and notifications during crank
  subclusters: StoredValue; // Holds Subcluster[]
  nextSubclusterId: StoredValue; // Holds string
  vatToSubclusterMap: StoredValue; // Holds Record<VatId, SubclusterId>
  logger?: Logger | undefined;
};

export type StoredValue = {
  get(): string | undefined;
  set(newValue: string): void;
  delete(): void;
};

export type StoredQueue = {
  enqueue(item: object): void;
  dequeue(): object | undefined;
  delete(): void;
};

export type VatCleanupWork = {
  exports: number;
  imports: number;
  promises: number;
  kv: number;
};

/**
 * Superstruct schema for {@link LocationHintEntry}, used for runtime validation
 * on both read and write paths of the location-hint store.
 */
export const LocationHintEntryStruct = object({
  addr: refine(string(), 'non-empty string', (value) => value.length > 0),
  lastSeen: refine(
    number(),
    'non-negative finite number',
    (value) => Number.isFinite(value) && value >= 0,
  ),
  isBootstrap: boolean(),
});

/**
 * A location-hint entry with metadata for prioritized selection and bounded
 * storage. A location hint is a netlayer-specific opaque string (e.g. a libp2p
 * relay multiaddr) that helps a netlayer re-locate and reconnect to a peer.
 */
export type LocationHintEntry = {
  /** Netlayer-specific opaque location-hint string. */
  addr: string;
  /**
   * Epoch ms when the location hint was last added or re-observed. Entries with
   * a lower value sort last during recency-based eviction.
   */
  lastSeen: number;
  /** True if provided at kernel initialization (prioritized during eviction). */
  isBootstrap: boolean;
};
