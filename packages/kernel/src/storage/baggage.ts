import { Collection } from './collections';
import type { VatStore } from './vatstore';
import { WeakCollection } from './weak-collections';

const BAGGAGE_ID = 'baggageID';
const NEXT_COLLECTION_ID = 'nextCollectionId';

export class Baggage {
  readonly #store: VatStore;

  readonly #collection: Collection<string, unknown>;

  #nextId: number;

  static async create(store: VatStore): Promise<Baggage> {
    const baggage = new Baggage(store);
    await store.set(BAGGAGE_ID, 'o+d6/1');
    await store.set(NEXT_COLLECTION_ID, 2);
    return baggage;
  }

  constructor(store: VatStore) {
    this.#store = store;
    this.#collection = new Collection(1, store, 'baggage');
    this.#nextId = 2;
  }

  async #ensureInitialized(): Promise<void> {
    const nextId = await this.#store.get(NEXT_COLLECTION_ID);
    this.#nextId = nextId ? Number(nextId) : 2;
  }

  async #getNextCollectionId(): Promise<number> {
    await this.#ensureInitialized();
    const id = this.#nextId;
    this.#nextId += 1;
    await this.#store.set(NEXT_COLLECTION_ID, this.#nextId);
    return id;
  }

  async get(key: string): Promise<unknown> {
    return this.#collection.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.#collection.init(key, value);
  }

  async createCollection<Value>(
    label: string,
  ): Promise<Collection<string, Value>> {
    const id = await this.#getNextCollectionId();
    return new Collection<string, Value>(id, this.#store, label);
  }

  async createWeakCollection<Value extends object>(
    label: string,
  ): Promise<WeakCollection<string, Value>> {
    const id = await this.#getNextCollectionId();
    return new WeakCollection<string, Value>(id, this.#store, label);
  }
}
