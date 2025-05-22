import type { KVStore } from '@metamask/kernel-store';

import type { KRef } from '../types.ts';

export type StoreContext = {
  kv: KVStore;
  runQueue: StoredQueue;
  runQueueLengthCache: number;
  nextObjectId: StoredValue;
  nextPromiseId: StoredValue;
  nextVatId: StoredValue;
  nextRemoteId: StoredValue;
  maybeFreeKrefs: Set<KRef>;
  gcActions: StoredValue;
  reapQueue: StoredValue;
  terminatedVats: StoredValue;
  inCrank: boolean;
  savepoints: string[];
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
