import type { DuplexStream } from '@ocap/streams';

import { VatCommandMethod, VatStorageMethod } from '../messages/index.js';
import type { VatCommand, VatCommandReply } from '../messages/index.js';
import type { MessageResolver } from '../messages/message-resolver.js';

export class ProxyStore {
  readonly #stream: DuplexStream<VatCommand, VatCommandReply>;

  readonly #resolver: MessageResolver;

  constructor(
    stream: DuplexStream<VatCommand, VatCommandReply>,
    resolver: MessageResolver,
  ) {
    this.#stream = stream;
    this.#resolver = resolver;
  }

  async get(key: string): Promise<string | undefined> {
    return this.#resolver
      .createMessage<VatCommandReply['payload']['params']>(
        async (messageId) => {
          await this.#stream.write({
            id: messageId,
            payload: {
              method: VatCommandMethod.storage,
              params: { method: VatStorageMethod.get, params: key },
            },
          });
        },
      )
      .then((response) => {
        // Extract just the params value from the storage response
        if (response && typeof response === 'object' && 'params' in response) {
          return response.params as string;
        }
        return response as string | undefined;
      });
  }

  async set(key: string, value: string): Promise<void> {
    await this.#resolver.createMessage<VatCommandReply['payload']['params']>(
      async (messageId) => {
        await this.#stream.write({
          id: messageId,
          payload: {
            method: VatCommandMethod.storage,
            params: { method: VatStorageMethod.set, params: { key, value } },
          },
        });
      },
    );
  }

  async delete(key: string): Promise<void> {
    await this.#resolver.createMessage<VatCommandReply['payload']['params']>(
      async (messageId) => {
        await this.#stream.write({
          id: messageId,
          payload: {
            method: VatCommandMethod.storage,
            params: { method: VatStorageMethod.delete, params: key },
          },
        });
      },
    );
  }
}
