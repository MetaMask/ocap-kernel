import { makePromiseKit } from '@endo/promise-kit';
import { makeCounter } from '@ocap/utils';

import type { PromiseCallbacks } from '../types.js';

export class MessageResolver {
  readonly prefix: string;

  readonly unresolvedMessages = new Map<string, PromiseCallbacks>();

  readonly #messageCounter = makeCounter();

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  async createMessage<Method>(
    callback: (messageId: string) => Promise<void>,
  ): Promise<Method> {
    const { promise, reject, resolve } = makePromiseKit<Method>();
    const messageId = this.#nextMessageId();

    this.unresolvedMessages.set(messageId, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    // eslint-disable-next-line n/callback-return
    callback(messageId).catch(console.error);
    return promise;
  }

  handleResponse(messageId: string, value: unknown): void {
    const promiseCallbacks = this.unresolvedMessages.get(messageId);
    if (promiseCallbacks === undefined) {
      console.error(`No unresolved message with id "${messageId}".`);
    } else {
      this.unresolvedMessages.delete(messageId);
      promiseCallbacks.resolve(value);
    }
  }

  terminateAll(error: Error): void {
    for (const [messageId, promiseCallback] of this.unresolvedMessages) {
      promiseCallback?.reject(error);
      this.unresolvedMessages.delete(messageId);
    }
  }

  #nextMessageId(): string {
    return `${this.prefix}:${this.#messageCounter()}`;
  }
}
