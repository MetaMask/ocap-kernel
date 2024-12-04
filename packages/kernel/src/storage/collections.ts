import type { VatStore } from './vat-store.js';

// Collection metadata keys use this prefix
const COLLECTION_PREFIX = 'vc';

/**
 * Metadata structure for collections that tracks:
 * - Number of entries
 * - Next available ordinal
 * - Schema information for stored data
 */
type CollectionMetadata = {
  entryCount: number;
  label: string;
  version: string;
};

/**
 * Structure for entries stored in the collection.
 */
export type StoredEntry<Value> = {
  value: Value;
  timestamp: number;
};

/**
 * Collection provides persistent key-value storage within a vat.
 * It maintains metadata about stored entries and handles serialization/deserialization.
 *
 * Features:
 * - Persistent storage across vat restarts
 * - Entry counting and metadata tracking
 * - JSON serialization of values
 * - Support for capability slots
 *
 * @template Key - Must be string for now
 * @template Value - The type of values stored in the collection
 */
export class Collection {
  readonly id: number;

  readonly #store: VatStore;

  readonly #label: string;

  #metadata: CollectionMetadata;

  /**
   * Creates a new Collection instance.
   *
   * @param id - Unique identifier for this collection
   * @param store - VatStore instance for persistence
   * @param label - Human-readable label for the collection
   */
  constructor(id: number, store: VatStore, label: string) {
    this.id = id;
    this.#store = store;
    this.#label = label;
    // Initialize metadata with default values
    this.#metadata = {
      entryCount: 0,
      label,
      version: '1.0.0',
    };
    // Load existing metadata if it exists
    this.#loadMetadata().catch((error) => {
      console.error('Failed to load collection metadata:', error);
    });
  }

  /**
   * Generates a storage key for a collection entry.
   * Format: vc.<collection_id>.<key>
   *
   * @param key - The key to generate a storage key for
   * @returns The generated storage key
   * @throws If key is not a string
   */
  #makeKey(key: string): string {
    if (typeof key === 'string') {
      return `${COLLECTION_PREFIX}.${this.id}.${key}`;
    }
    throw new Error('Only string keys are supported');
  }

  /**
   * Generates the storage key for collection metadata.
   * Format: vc.<collection_id>.|metadata
   *
   * @returns The metadata storage key
   */
  #makeMetadataKey(): string {
    return `${COLLECTION_PREFIX}.${this.id}.|metadata`;
  }

  /**
   * Initializes or updates a value in the collection.
   *
   * @param key - The key to initialize or update
   * @param value - The value to store
   */
  async init<Value>(key: string, value: Value): Promise<void> {
    const entry: StoredEntry<Value> = {
      value,
      timestamp: Date.now(),
    };

    const keyString = this.#makeKey(key);
    await this.#store.set(keyString, entry);
    this.#metadata.entryCount += 1;
    await this.#saveMetadata();
  }

  /**
   * Retrieves and deserializes a value from the collection.
   *
   * @param key - The key to retrieve
   * @returns The stored value, or undefined if not found
   */
  async get<Value>(key: string): Promise<Value | undefined> {
    const keyString = this.#makeKey(key);
    const entry = (await this.#store.get(keyString)) as
      | StoredEntry<Value>
      | undefined;
    return entry?.value;
  }

  /**
   * Deletes an entry from the collection.
   * - Removes the stored value
   * - Updates entry count
   * - Persists metadata changes
   *
   * @param key - The key to delete
   */
  async delete(key: string): Promise<void> {
    const keyString = this.#makeKey(key);
    await this.#store.delete(keyString);
    this.#metadata.entryCount -= 1;
    await this.#saveMetadata();
  }

  /**
   * Persists the current metadata state.
   */
  async #saveMetadata(): Promise<void> {
    await this.#store.set(this.#makeMetadataKey(), this.#metadata);
  }

  /**
   * Loads metadata from storage or initializes default metadata.
   */
  async #loadMetadata(): Promise<void> {
    const metadata = await this.#store.get(this.#makeMetadataKey());
    if (metadata) {
      this.#metadata = metadata as CollectionMetadata;
    } else {
      // If no metadata exists, save the initial metadata
      await this.#saveMetadata();
    }
  }

  /**
   * Gets the collection's label.
   *
   * @returns The collection's label
   */
  get label(): string {
    return this.#label;
  }

  /**
   * Gets the current number of entries in the collection.
   *
   * @returns The number of entries in the collection
   */
  get size(): number {
    return this.#metadata.entryCount;
  }
}
