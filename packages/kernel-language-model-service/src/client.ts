import { E } from '@endo/eventual-send';
import type { ERef } from '@endo/eventual-send';

import type {
  ChatParams,
  ChatResult,
  ChatService,
  ChatStreamChunk,
  SampleParams,
  SampleResult,
  SampleService,
} from './types.ts';

/**
 * Wraps a remote service reference with Open /v1-style chat completion ergonomics.
 *
 * Usage:
 * ```ts
 * const client = makeChatClient(lmsRef, 'gpt-4o');
 * const result = await client.chat.completions.create({ messages });
 * const stream = await client.chat.completions.create({ messages, stream: true });
 * ```
 *
 * @param lmsRef - Reference to a service with a `chat` method.
 * @param defaultModel - Default model name used when params do not specify one.
 * @returns A client object with `chat.completions.create`.
 */
export const makeChatClient = (
  lmsRef: ERef<ChatService>,
  defaultModel?: string,
): {
  chat: {
    completions: {
      create(
        params: Omit<ChatParams, 'model'> & { model?: string; stream: true },
      ): Promise<AsyncIterable<ChatStreamChunk>>;
      create(
        params: Omit<ChatParams, 'model'> & { model?: string; stream?: false },
      ): Promise<ChatResult>;
    };
  };
} => {
  type BaseParams = Omit<ChatParams, 'model'> & { model?: string };

  /**
   * @param params - Chat completion parameters with `stream: true`.
   * @returns A promise resolving to an async iterable of stream chunks.
   */
  function create(
    params: BaseParams & { stream: true },
  ): Promise<AsyncIterable<ChatStreamChunk>>;
  /**
   * @param params - Chat completion parameters.
   * @returns A promise resolving to the full chat result.
   */
  function create(params: BaseParams & { stream?: false }): Promise<ChatResult>;
  /**
   * @param params - Chat completion parameters.
   * @returns A promise resolving to a stream or full result depending on `stream`.
   */
  async function create(
    params: BaseParams,
  ): Promise<AsyncIterable<ChatStreamChunk> | ChatResult> {
    const model = params.model ?? defaultModel;
    if (!model) {
      throw new Error('model is required');
    }
    const fullParams = harden({ ...params, model });
    if (fullParams.stream === true) {
      return E(lmsRef).chat(fullParams as ChatParams & { stream: true });
    }
    return E(lmsRef).chat(fullParams as ChatParams & { stream?: false });
  }

  return harden({ chat: { completions: { create } } });
};

/**
 * Wraps a remote service reference with raw token-prediction ergonomics.
 *
 * Usage:
 * ```ts
 * const client = makeSampleClient(lmsRef, 'llama3');
 * const result = await client.sample({ prompt: 'Once upon' });
 * ```
 *
 * @param lmsRef - Reference to a service with a `sample` method.
 * @param defaultModel - Default model name used when params do not specify one.
 * @returns A client object with `sample`.
 */
export const makeSampleClient = (
  lmsRef: ERef<SampleService>,
  defaultModel?: string,
): {
  sample: (
    params: Omit<SampleParams, 'model'> & { model?: string },
  ) => Promise<SampleResult>;
} =>
  harden({
    async sample(
      params: Omit<SampleParams, 'model'> & { model?: string },
    ): Promise<SampleResult> {
      const model = params.model ?? defaultModel;
      if (!model) {
        throw new Error('model is required');
      }
      return E(lmsRef).sample(harden({ ...params, model }));
    },
  });
