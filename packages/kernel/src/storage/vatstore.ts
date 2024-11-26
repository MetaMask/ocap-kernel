import type { KVStore } from '../kernel-store';
import type { VatId } from '../types';

export class VatStore {
  readonly #store: KVStore;

  readonly #vatId: VatId;

  constructor(vatId: VatId, store: KVStore) {
    this.#vatId = vatId;
    this.#store = store;
  }

  #makeKey(key: string): string {
    return `${this.#vatId}.vs.${key}`;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.#store.set(this.#makeKey(key), JSON.stringify(value));
  }

  async get(key: string): Promise<unknown> {
    const value = this.#store.get(this.#makeKey(key));
    return value ? JSON.parse(value) : undefined;
  }

  async has(key: string): Promise<boolean> {
    return this.#store.has(this.#makeKey(key));
  }

  async delete(key: string): Promise<void> {
    this.#store.delete(this.#makeKey(key));
  }
}
