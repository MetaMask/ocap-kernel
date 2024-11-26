import type { StoredEntry } from './collections';
import type { VatStore } from './vatstore';

const WEAK_PREFIX = 'wc';
const REF_COUNT_PREFIX = 'rc';

export class WeakCollection<Key extends string, Value extends object> {
  readonly #id: number;

  readonly #store: VatStore;

  readonly #label: string;

  constructor(id: number, store: VatStore, label: string) {
    this.#id = id;
    this.#store = store;
    this.#label = label;
  }

  #makeKey(key: Key): string {
    if (typeof key === 'string') {
      return `${WEAK_PREFIX}.${this.#id}.s${key}`;
    }
    throw new Error('Only string keys are supported');
  }

  #makeRefCountKey(key: Key): string {
    return `${REF_COUNT_PREFIX}.${this.#id}.${key}`;
  }

  async #getRefCount(key: Key): Promise<number> {
    const count = await this.#store.get(this.#makeRefCountKey(key));
    return count ? Number(count) : 0;
  }

  async #incRefCount(key: Key): Promise<number> {
    const newCount = (await this.#getRefCount(key)) + 1;
    await this.#store.set(this.#makeRefCountKey(key), newCount);
    return newCount;
  }

  async #decRefCount(key: Key): Promise<number> {
    const newCount = (await this.#getRefCount(key)) - 1;
    await this.#store.set(this.#makeRefCountKey(key), newCount);
    if (newCount <= 0) {
      await this.delete(key);
    }
    return newCount;
  }

  async init(key: Key, value: Value): Promise<void> {
    const keyString = this.#makeKey(key);
    await this.#store.set(keyString, {
      body: JSON.stringify(value),
      slots: [],
    } satisfies StoredEntry);
    await this.#incRefCount(key);
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
    await this.#store.delete(this.#makeRefCountKey(key));
  }

  async has(key: Key): Promise<boolean> {
    const keyString = this.#makeKey(key);
    return this.#store.has(keyString);
  }

  async addRef(key: Key): Promise<void> {
    await this.#incRefCount(key);
  }

  async removeRef(key: Key): Promise<void> {
    await this.#decRefCount(key);
  }

  get label(): string {
    return this.#label;
  }
}
