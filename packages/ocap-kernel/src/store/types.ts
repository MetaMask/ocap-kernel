import type { KVStore } from '@metamask/kernel-store';
import type { Logger } from '@metamask/logger';

import type { KRef, RunQueueItemNotify, RunQueueItemSend } from '../types.ts';

export type CrankBufferItem = RunQueueItemSend | RunQueueItemNotify;

export type StoreContext = {
  kv: KVStore;
  runQueue: StoredQueue; // Holds RunAction[]
  runQueueLengthCache: number; // Holds number
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
