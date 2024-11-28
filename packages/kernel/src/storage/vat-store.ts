import { getSafeJson } from '@metamask/utils';

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
    const safeValue = JSON.stringify(getSafeJson(value));
    this.#store.set(this.#makeKey(key), safeValue);
  }

  async get(key: string): Promise<unknown> {
    const value = this.#store.get(this.#makeKey(key));
    try {
      return value ? JSON.parse(value) : undefined;
    } catch {
      throw new Error(`Failed to parse stored value for key "${key}"`);
    }
  }

  async has(key: string): Promise<boolean> {
    return this.#store.has(this.#makeKey(key));
  }

  async delete(key: string): Promise<void> {
    this.#store.delete(this.#makeKey(key));
  }
}
