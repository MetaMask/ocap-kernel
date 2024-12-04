import { getSafeJson } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type { DuplexStream } from '@ocap/streams';

import { ProxyStore } from './proxy-store.js';
import type { VatCommand, VatCommandReply } from '../messages/index.js';
import { MessageResolver } from '../messages/index.js';
import type { VatId } from '../types.js';

export class VatStore {
  readonly #store: ProxyStore;

  readonly #vatId: VatId;

  constructor(
    vatId: VatId,
    commandStream: DuplexStream<VatCommand, VatCommandReply>,
    resolver: MessageResolver,
  ) {
    this.#vatId = vatId;
    this.#store = new ProxyStore(commandStream, resolver);
  }

  #makeKey(key: string): string {
    return `${this.#vatId}.vs.${key}`;
  }

  async set(key: string, value: unknown): Promise<void> {
    const safeValue = JSON.stringify(getSafeJson(value));
    await this.#store.set(this.#makeKey(key), safeValue);
  }

  async get(key: string): Promise<Json> {
    const value = await this.#store.get(this.#makeKey(key));
    try {
      return value ? JSON.parse(value) : undefined;
    } catch {
      throw new Error(`Failed to parse stored value for key "${key}"`);
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.#store.get(this.#makeKey(key));
    return Boolean(value);
  }

  async delete(key: string): Promise<void> {
    await this.#store.delete(this.#makeKey(key));
  }
}
