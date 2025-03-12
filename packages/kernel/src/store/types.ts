import type { KVStore } from '@ocap/store';

import type { KRef } from '../types.ts';

export type StoreContext = {
  kv: KVStore;
  runQueue: StoredQueue;
  nextObjectId: StoredValue;
  nextPromiseId: StoredValue;
  maybeFreeKrefs: Set<KRef>;
  gcActions: StoredValue;
  reapQueue: StoredValue;
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
