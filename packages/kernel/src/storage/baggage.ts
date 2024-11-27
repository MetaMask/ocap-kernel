import { Collection } from './collections';
import type { VatStore } from './vat-store';
import { WeakCollection } from './weak-collections';

export const BAGGAGE_ID = 'baggageID';
export const NEXT_COLLECTION_ID = 'nextCollectionId';
export const STORAGE_VERSION = '1.0.0';

/**
 * Baggage provides persistent storage capabilities for vats.
 * It manages collections and their lifecycle, serving as the main entry point
 * for vat-specific storage operations.
 *
 * Each vat gets its own Baggage instance that:
 * - Maintains unique IDs for collections
 * - Provides access to stored values
 * - Creates and manages both regular and weak collections
 */
export class Baggage {
  readonly #store: VatStore;

  readonly #collection: Collection<string, unknown>;

  #nextId: number;

  /**
   * Creates a new Baggage instance with initialized storage.
   * This is the preferred way to create a Baggage instance as it ensures
   * proper initialization of the storage system.
   *
   * @param store - The VatStore instance to use for persistence
   * @returns A new, initialized Baggage instance
   */
  static async create(store: VatStore): Promise<Baggage> {
    const baggage = new Baggage(store);
    await store.set(BAGGAGE_ID, STORAGE_VERSION);
    if (!(await store.has(NEXT_COLLECTION_ID))) {
      await store.set(NEXT_COLLECTION_ID, 2);
    }
    await baggage.#ensureInitialized();
    return baggage;
  }

  /**
   * Creates a new Baggage instance.
   * Note: Prefer using Baggage.create() instead of direct constructor usage.
   *
   * @param store - The VatStore instance to use for persistence
   */
  constructor(store: VatStore) {
    this.#store = store;
    // Collection ID 1 is reserved for baggage's own storage
    this.#collection = new Collection(1, store, 'baggage');
    this.#nextId = 2;
  }

  /**
   * Ensures the baggage system is properly initialized by loading the next
   * available collection ID from storage.
   *
   */
  async #ensureInitialized(): Promise<void> {
    const nextId = await this.#store.get(NEXT_COLLECTION_ID);
    const parsedId = nextId ? Number(nextId) : 2;
    this.#nextId = !nextId || !Number.isFinite(parsedId) ? 2 : parsedId;
  }

  /**
   * Generates and persists the next available collection ID.
   * This ensures unique IDs across vat restarts.
   *
   * @returns The next available collection ID
   */
  async #getNextCollectionId(): Promise<number> {
    await this.#ensureInitialized();
    const id = this.#nextId;
    this.#nextId += 1;
    await this.#store.set(NEXT_COLLECTION_ID, this.#nextId);
    return id;
  }

  /**
   * Retrieves a value from baggage's own storage.
   *
   * @param key - The key to retrieve
   * @returns The stored value, or undefined if not found
   */
  async get(key: string): Promise<unknown> {
    return this.#collection.get(key);
  }

  /**
   * Stores a value in baggage's own storage.
   *
   * @param key - The key to store under
   * @param value - The value to store
   */
  async set(key: string, value: unknown): Promise<void> {
    await this.#collection.init(key, value);
  }

  /**
   * Creates a new Collection instance with a unique ID.
   * Collections provide persistent storage for key-value pairs within a vat.
   *
   * @param label - A human-readable label for the collection
   * @returns A new Collection instance
   * @template Value - The type of values stored in the collection
   */
  async createCollection<Value>(
    label: string,
  ): Promise<Collection<string, Value>> {
    const id = await this.#getNextCollectionId();
    return new Collection<string, Value>(id, this.#store, label);
  }

  /**
   * Creates a new WeakCollection instance with a unique ID.
   * WeakCollections are similar to regular collections but:
   * - Only accept objects as values
   * - Support reference counting
   * - Can automatically cleanup when references are dropped
   *
   * @param label - A human-readable label for the collection
   * @returns A new WeakCollection instance
   * @template Value - The type of objects stored in the collection
   */
  async createWeakCollection<Value extends object>(
    label: string,
  ): Promise<WeakCollection<string, Value>> {
    const id = await this.#getNextCollectionId();
    return new WeakCollection<string, Value>(id, this.#store, label);
  }
}
