// XXX placeholder to get around @agoric/store package configuration issues
// <reference types="ses" />

// This is Agoric code that breaks some of our local eslint rules. Disabling
// those because the code's not for us to redefine.
/* eslint-disable @typescript-eslint/naming-convention,
   @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unnecessary-type-arguments */

import type { Passable, RemotableObject } from '@endo/pass-style';
import type { CopySet, CopyMap, Pattern } from '@endo/patterns';

/**
 * Of the dimensions on which KeyedStores can differ, we only represent a few of them
 * as standard options. A given store maker should document which options it supports,
 * as well as its positions on dimensions for which it does not support options.
 */
export type StoreOptions = {
  /**
   * Which way to optimize a weak store. True means that we expect this weak store
   * to outlive most of its keys, in which case we internally may use a JavaScript
   * `WeakMap`. Otherwise we internally may use a JavaScript `Map`. Defaults to true,
   * so please mark short lived stores explicitly.
   */
  longLived?: boolean;

  /**
   * The contents of this store survive termination of its containing process,
   * allowing for restart or upgrade but at the cost of forbidding storage of
   * references to ephemeral data. Defaults to false.
   */
  durable?: boolean;

  /**
   * This store pretends to be a durable store but does not enforce that the things
   * stored in it actually be themselves durable (whereas an actual durable store
   * would forbid storage of such items). This is in service of allowing incremental
   * transition to use of durable stores, to enable normal operation and testing when
   * some stuff intended to eventually be durable has not yet been made durable. A
   * store marked as fakeDurable will appear to operate normally but any attempt to
   * upgrade its containing vat will fail with an error. Defaults to false.
   */
  fakeDurable?: boolean;

  keyShape?: Pattern;
  valueShape?: Pattern;
};

/**
 * Most store methods are in one of three categories
 *
 * - lookup methods (`has`,`get`)
 * - update methods (`add`,`init`,`set`,`delete`,`addAll`)
 * - query methods (`snapshot`,`keys`,`values`,`entries`,`getSize`)
 * - query-update methods (`clear`)
 *
 * WeakStores have the lookup and update methods but not the query or
 * query-update methods. Non-weak Stores are like their corresponding
 * WeakStores, but with the additional query and query-update methods.
 */

// TODO use Key for K
export type WeakSetStoreMethods<K> = {
  /**
   * Check if a key exists. The key can be any JavaScript value, though the answer
   * will always be false for keys that cannot be found in this store.
   */
  has(key: K): boolean;

  /**
   * Add the key to the set if it is not already there. Do nothing silently if
   * already there. The key must be one allowed by this store. For example a scalar
   * store only allows primitives and remotables.
   */
  add(key: K): void;

  /**
   * Remove the key. Throws if not found.
   */
  delete(key: K): void;

  addAll(keys: CopySet<any> | Iterable<K>): void;
};

export type WeakSetStore<K> = RemotableObject & WeakSetStoreMethods<K>;

// TODO use Key for K
export type SetStoreMethods<K> = {
  /**
   * Check if a key exists. The key can be any JavaScript value, though the answer
   * will always be false for keys that cannot be found in this store.
   */
  has(key: K): boolean;

  /**
   * Add the key to the set if it is not already there. Do nothing silently if
   * already there. The key must be one allowed by this store. For example a scalar
   * store only allows primitives and remotables.
   */
  add(key: K): void;

  /**
   * Remove the key. Throws if not found.
   */
  delete(key: K): void;

  addAll(keys: CopySet<any> | Iterable<K>): void;
  keys(keyPatt?: Pattern): Iterable<K>;
  values(keyPatt?: Pattern): Iterable<K>;
  snapshot(keyPatt?: Pattern): CopySet<any>;
  getSize(keyPatt?: Pattern): number;
  clear(keyPatt?: Pattern): void;
};

export type SetStore<K> = RemotableObject & SetStoreMethods<K>;

// TODO use Key for K
// TODO use Passable for V
export type WeakMapStore<K, V> = {
  /**
   * Check if a key exists. The key can be any JavaScript value, though the answer
   * will always be false for keys that cannot be found in this store.
   */
  has(key: K): boolean;

  /**
   * Return a value for the key. Throws if not found.
   */
  get(key: K): V;

  /**
   * Initialize the key only if it doesn't already exist. The key must be one
   * allowed by this store. For example a scalar store only allows primitives
   * and remotables.
   */
  init(key: K, value: V): void;

  /**
   * Set the key. Throws if not found.
   */
  set(key: K, value: V): void;

  /**
   * Remove the key. Throws if not found.
   */
  delete(key: K): void;

  addAll(entries: CopyMap<any, any> | Iterable<[K, V]>): void;
};

// TODO use Key for K
// TODO use Passable for V
export type MapStoreMethods<K, V> = {
  /**
   * Check if a key exists. The key can be any JavaScript value, though the answer
   * will always be false for keys that cannot be found in this map
   */
  has(key: K): boolean;

  /**
   * Return a value for the key. Throws if not found.
   */
  get(key: K): V;

  /**
   * Initialize the key only if it doesn't already exist. The key must be one
   * allowed by this store. For example a scalar store only allows primitives
   * and remotables.
   */
  init(key: K, value: V): void;

  /**
   * Set the key. Throws if not found.
   */
  set(key: K, value: V): void;

  /**
   * Remove the key. Throws if not found.
   */
  delete(key: K): void;

  addAll(entries: CopyMap<any, Passable> | Iterable<[K, V]>): void;
  keys(keyPatt?: Pattern, valuePatt?: Pattern): Iterable<K>;
  values(keyPatt?: Pattern, valuePatt?: Pattern): Iterable<V>;
  entries(keyPatt?: Pattern, valuePatt?: Pattern): Iterable<[K, V]>;
  snapshot(keyPatt?: Pattern, valuePatt?: Pattern): CopyMap<any, Passable>;
  getSize(keyPatt?: Pattern, valuePatt?: Pattern): number;
  clear(keyPatt?: Pattern, valuePatt?: Pattern): void;
};

export type MapStore<K = any, V = any> = RemotableObject &
  MapStoreMethods<K, V>;

// ///////////////////////// Deprecated Legacy /////////////////////////////////

/**
 * LegacyWeakMap is deprecated. Use WeakMapStore instead if possible.
 */
export type LegacyWeakMap<K, V> = {
  /** Check if a key exists */
  has(key: K): boolean;

  /** Return a value for the key. Throws if not found. */
  get(key: K): V;

  /** Initialize the key only if it doesn't already exist */
  init(key: K, value: V): void;

  /** Set the key. Throws if not found. */
  set(key: K, value: V): void;

  /** Remove the key. Throws if not found. */
  delete(key: K): void;
};

/**
 * LegacyMap is deprecated. Use MapStore instead if possible.
 */
export type LegacyMap<K, V> = {
  /** Check if a key exists */
  has(key: K): boolean;

  /** Return a value for the key. Throws if not found. */
  get(key: K): V;

  /** Initialize the key only if it doesn't already exist */
  init(key: K, value: V): void;

  /** Set the key. Throws if not found. */
  set(key: K, value: V): void;

  /** Remove the key. Throws if not found. */
  delete(key: K): void;

  keys(): Iterable<K>;
  values(): Iterable<V>;
  entries(): Iterable<[K, V]>;
  getSize(): number;
  clear(): void;
};
