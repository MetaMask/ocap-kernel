import { makePromiseKit } from '@endo/promise-kit';
import type { Logger } from '@ocap/utils';
import { makeLogger, makeCounter } from '@ocap/utils';

import type { PromiseCallbacks } from '../types.ts';

export class MessageResolver {
  readonly #prefix: string;

  readonly #logger: Logger;

  readonly unresolvedMessages = new Map<string, PromiseCallbacks>();

  readonly #messageCounter = makeCounter();

  constructor(prefix: string, parentLogger?: Logger) {
    this.#prefix = prefix;
    this.#logger = makeLogger(`[message-resolver ${prefix}]`, parentLogger);
  }

  async createMessage<Method>(
    sendMessage: (messageId: string) => Promise<void>,
  ): Promise<Method> {
    const { promise, reject, resolve } = makePromiseKit<Method>();
    const messageId = this.#nextMessageId();

    this.unresolvedMessages.set(messageId, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });

    sendMessage(messageId).catch((error) => this.#logger.error(error));
    return promise;
  }

  handleResponse(messageId: string, value: unknown): void {
    const promiseCallbacks = this.unresolvedMessages.get(messageId);
    if (promiseCallbacks === undefined) {
      this.#logger.error(`No unresolved message with id "${messageId}".`);
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
    return `${this.#prefix}:${this.#messageCounter()}`;
  }
}
