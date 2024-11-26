import type { VatStore } from './vatstore';

// Collection metadata keys use this prefix
const COLLECTION_PREFIX = 'vc';

type CollectionMetadata = {
  entryCount: number;
  nextOrdinal: number;
  schemata: {
    label: string;
    body: string;
    slots: unknown[];
  };
};

// Add type for stored entries
export type StoredEntry = {
  body: string;
  slots: unknown[];
};

export class Collection<Key extends string, Value> {
  readonly #id: number;

  readonly #store: VatStore;

  readonly #label: string;

  #metadata: CollectionMetadata;

  constructor(id: number, store: VatStore, label: string) {
    this.#id = id;
    this.#store = store;
    this.#label = label;
    this.#metadata = {
      entryCount: 0,
      nextOrdinal: 1,
      schemata: {
        label,
        body: '#[{"#tag":"match:scalar","payload":"#undefined"}]',
        slots: [],
      },
    };
    // Load existing metadata if it exists
    this.#loadMetadata().catch((error) => {
      console.error('Failed to load collection metadata:', error);
    });
  }

  #makeKey(key: Key): string {
    if (typeof key === 'string') {
      return `${COLLECTION_PREFIX}.${this.#id}.s${key}`;
    }
    throw new Error('Only string keys are supported');
  }

  #makeMetadataKey(): string {
    return `${COLLECTION_PREFIX}.${this.#id}.|metadata`;
  }

  async init(key: Key, value: Value): Promise<void> {
    const keyString = this.#makeKey(key);
    await this.#store.set(keyString, {
      body: JSON.stringify(value),
      slots: [],
    } satisfies StoredEntry);
    this.#metadata.entryCount += 1;
    await this.#saveMetadata();
  }

  async get(key: Key): Promise<Value | undefined> {
    const keyString = this.#makeKey(key);
    const entry = (await this.#store.get(keyString)) as StoredEntry | undefined;
    if (!entry) {
      return undefined;
    }
    return JSON.parse(entry.body);
  }

  async delete(key: Key): Promise<void> {
    const keyString = this.#makeKey(key);
    await this.#store.delete(keyString);
    this.#metadata.entryCount -= 1;
    await this.#saveMetadata();
  }

  async #saveMetadata(): Promise<void> {
    await this.#store.set(this.#makeMetadataKey(), this.#metadata);
  }

  async #loadMetadata(): Promise<void> {
    const metadata = await this.#store.get(this.#makeMetadataKey());
    if (metadata) {
      this.#metadata = metadata as CollectionMetadata;
    } else {
      // If no metadata exists, save the initial metadata
      await this.#saveMetadata();
    }
  }

  // Expose collection info
  get label(): string {
    return this.#label;
  }

  get size(): number {
    return this.#metadata.entryCount;
  }
}
