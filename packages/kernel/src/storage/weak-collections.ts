import { getSafeJson } from '@metamask/utils';

import type { StoredEntry } from './collections';
import type { VatStore } from './vat-store';

/** Prefix for weak collection storage keys */
const WEAK_PREFIX = 'wc';
/** Prefix for reference count storage keys */
const REF_COUNT_PREFIX = 'rc';

/**
 * WeakCollection provides reference-counted storage for objects within a vat.
 * Similar to WeakMap in JavaScript, it holds "weak" references to objects,
 * allowing them to be garbage collected when no references remain.
 *
 * Features:
 * - Reference counting for stored objects
 * - Automatic cleanup when reference count hits zero
 * - JSON serialization of values
 * - Type safety for object-only values
 *
 * @template Key - Must be string for now
 * @template Value - Must be an object type (not primitives)
 */
export class WeakCollection<Key extends string, Value extends object> {
  readonly #id: number;

  readonly #store: VatStore;

  readonly #label: string;

  /**
   * Creates a new WeakCollection instance.
   *
   * @param id - Unique identifier for this collection
   * @param store - VatStore instance for persistence
   * @param label - Human-readable label for the collection
   */
  constructor(id: number, store: VatStore, label: string) {
    this.#id = id;
    this.#store = store;
    this.#label = label;
  }

  /**
   * Generates a storage key for a collection entry.
   * Format: wc.<collection_id>.s<key>
   *
   * @param key - The key to generate a storage key for
   * @returns The generated storage key
   * @throws If key is not a string
   */
  #makeKey(key: Key): string {
    if (typeof key === 'string') {
      return `${WEAK_PREFIX}.${this.#id}.s${key}`;
    }
    throw new Error('Only string keys are supported');
  }

  /**
   * Generates a storage key for a reference count.
   * Format: rc.<collection_id>.<key>
   *
   * @param key - The key to generate a ref count key for
   * @returns The generated ref count key
   */
  #makeRefCountKey(key: Key): string {
    return `${REF_COUNT_PREFIX}.${this.#id}.${key}`;
  }

  /**
   * Gets the current reference count for a key.
   *
   * @param key - The key to get the ref count for
   * @returns The current reference count (0 if not found)
   */
  async #getRefCount(key: Key): Promise<number> {
    const count = await this.#store.get(this.#makeRefCountKey(key));
    return count ? Number(count) : 0;
  }

  /**
   * Increments the reference count for a key.
   *
   * @param key - The key to increment the ref count for
   * @returns The new reference count
   */
  async #incRefCount(key: Key): Promise<number> {
    const newCount = (await this.#getRefCount(key)) + 1;
    await this.#store.set(this.#makeRefCountKey(key), newCount);
    return newCount;
  }

  /**
   * Decrements the reference count for a key.
   * If count reaches zero, the entry is deleted.
   *
   * @param key - The key to decrement the ref count for
   * @returns The new reference count
   */
  async #decRefCount(key: Key): Promise<number> {
    const newCount = (await this.#getRefCount(key)) - 1;
    await this.#store.set(this.#makeRefCountKey(key), newCount);
    if (newCount <= 0) {
      await this.delete(key);
    }
    return newCount;
  }

  /**
   * Initializes or updates a value in the collection.
   * Also initializes its reference count to 1.
   *
   * @param key - The key to store under
   * @param value - The object to store
   */
  async init(key: Key, value: Value): Promise<void> {
    const keyString = this.#makeKey(key);
    await this.#store.set(keyString, {
      body: JSON.stringify(getSafeJson(value)), // TODO: Better serialization
      slots: [],
    } satisfies StoredEntry);
    await this.#incRefCount(key);
  }

  /**
   * Retrieves and deserializes a value from the collection.
   *
   * @param key - The key to retrieve
   * @returns The deserialized object, or undefined if not found
   */
  async get(key: Key): Promise<Value | undefined> {
    const keyString = this.#makeKey(key);
    const entry = (await this.#store.get(keyString)) as StoredEntry | undefined;
    if (!entry) {
      return undefined;
    }
    return JSON.parse(entry.body);
  }

  /**
   * Deletes an entry and its reference count from the collection.
   *
   * @param key - The key to delete
   */
  async delete(key: Key): Promise<void> {
    const keyString = this.#makeKey(key);
    await this.#store.delete(keyString);
    await this.#store.delete(this.#makeRefCountKey(key));
  }

  /**
   * Checks if a key exists in the collection.
   *
   * @param key - The key to check
   * @returns True if the key exists
   */
  async has(key: Key): Promise<boolean> {
    const keyString = this.#makeKey(key);
    return this.#store.has(keyString);
  }

  /**
   * Adds a reference to an object in the collection.
   * Increments its reference count.
   *
   * @param key - The key to add a reference to
   */
  async addRef(key: Key): Promise<void> {
    await this.#incRefCount(key);
  }

  /**
   * Removes a reference to an object in the collection.
   * Decrements its reference count and may trigger deletion.
   *
   * @param key - The key to remove a reference from
   */
  async removeRef(key: Key): Promise<void> {
    await this.#decRefCount(key);
  }

  /**
   * Gets the collection's label.
   *
   * @returns The collection's label
   */
  get label(): string {
    return this.#label;
  }
}
