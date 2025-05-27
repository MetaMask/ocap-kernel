import type { KVStore } from '@metamask/kernel-store';

import type {
  EndpointId,
  ERef,
  KOId,
  KPId,
  KRef,
  ORef,
  PRef,
  Ref,
  VatId,
  VRef,
} from '../refs/types.ts';
import type { PromiseState } from '../types.ts';
import type { SlotKey } from './methods/base.ts';
import type { ReachableAndVatSlot } from './utils/reachable.ts';

export type QueueName = 'run' | KPId;
export type QueueKey = `queue.${QueueName}`;

// A comma-separated list of elements, probably.
export type CommaList<Ele extends string> =
  | ''
  | `${Ele}`
  | `${Ele},${Ele}`
  | `${Ele},${Ele},${string}`;

/* eslint-disable @typescript-eslint/unified-signatures */
type KVStoreGet<Default> = {
  // Endpoint
  (key: `e.nextPromiseId.${EndpointId}`): `${number}` | Default;
  (key: `e.nextObjectId.${EndpointId}`): `${number}` | Default;

  // KernelPromise
  (key: `${KPId}.decider`): EndpointId | Default;
  (key: `${KPId}.subscribers`): string | Default;
  (key: `${KPId}.value`): string | Default;
  (key: `${KPId}.state`): PromiseState | Default;
  (key: `${KPId}.refCount`): `${number}` | Default;

  // KernelObject
  (key: `${KOId}.reachable`): boolean | Default;
  (key: `${KOId}.recognizable`): boolean | Default;
  (key: `${KOId}.refCount`): `${number},${number}` | Default;

  // KernelRef
  (key: `${KRef}.owner`): EndpointId | Default;
  (key: `${KRef}.root`): VRef | Default;
  (key: `${KRef}.refCount`): `${number}` | `${number},${number}` | Default;

  // SlotKey
  (key: SlotKey<KRef>): ReachableAndVatSlot | Default;
  (key: SlotKey<ERef & ORef>): KOId | Default;
  (key: SlotKey<ERef & PRef>): KPId | Default;
  (key: SlotKey<ERef>): KRef | Default;
  (key: SlotKey): Ref | Default;

  // Queue
  (key: `${QueueKey}.head`): `${number}` | Default;
  (key: `${QueueKey}.tail`): `${number}` | Default;
  (key: `${QueueKey}.${number}`): string | Default;

  // Kernel
  (key: `pinnedObjects`): CommaList<KRef> | Default;
  (key: `initialized`): 'true' | Default;

  // Clist
  (key: `cle.v${number}.o${string}`): KOId | Default;
  (key: `cle.v${number}.p${string}`): KPId | Default;

  // Vat
  (key: `vatConfig.${VatId}`): string | Default;

  // The key argument is bound to the string type,
  // but we require something more specific.
  (key: string): never;
};

export type TypedKVStore = Omit<KVStore, 'get' | 'getRequired' | 'set'> & {
  get: KVStoreGet<undefined>;
  getRequired: KVStoreGet<never>;

  set: {
    // Endpoint
    (key: `e.nextPromiseId.${EndpointId}`, value: `${number}`): void;
    (key: `e.nextObjectId.${EndpointId}`, value: `${number}`): void;

    // KernelPromise
    (key: `${KPId}.decider`, value: EndpointId): void;
    (key: `${KPId}.subscribers`, value: string): void;
    (key: `${KPId}.value`, value: string): void;
    (key: `${KPId}.state`, value: PromiseState): void;
    (key: `${KPId}.refCount`, value: `${number}`): void;

    // KernelObject
    (key: `${KOId}.reachable`, value: boolean): void;
    (key: `${KOId}.recognizable`, value: boolean): void;
    (key: `${KOId}.refCount`, value: `${number},${number}`): void;

    // KernelRef
    (key: `${KRef}.owner`, value: EndpointId): void;
    (key: `${KRef}.root`, value: VRef): void;
    (key: `${KRef}.refCount`, value: `${number}` | `${number},${number}`): void;

    // SlotKey
    (key: SlotKey<KRef>, value: ReachableAndVatSlot): void;
    (key: SlotKey<ERef & ORef>, value: KOId): void;
    (key: SlotKey<ERef & PRef>, value: KPId): void;
    (key: SlotKey<ERef>, value: KRef): void;

    // Queue
    (key: `${QueueKey}.head`, value: `${number}`): void;
    (key: `${QueueKey}.tail`, value: `${number}`): void;
    (key: `${QueueKey}.${number}`, value: string): void;

    // Kernel
    (key: `pinnedObjects`, value: CommaList<KRef>): void;
    (key: `initialized`, value: 'true'): void;

    // Vat
    (key: `vatConfig.${VatId}`, value: string): void;

    // The key argument is bound to the string type,
    // but we require something more specific.
    (key: string, value: never): void;
  };
};
/* eslint-enable @typescript-eslint/unified-signatures */

export type StoreContext = {
  kv: TypedKVStore;
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
};

export type StoredValue<Value = string> = {
  get(): Value | undefined;
  set(newValue: Value): void;
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
