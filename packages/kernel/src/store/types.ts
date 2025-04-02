import type { KVStore } from '@ocap/store';

import type { KRef, VatId } from '../types.ts';

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
  terminatedVats: VatId[];
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
