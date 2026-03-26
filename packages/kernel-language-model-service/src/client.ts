import { E } from '@endo/eventual-send';
import type { ERef } from '@endo/eventual-send';

import type {
  ChatParams,
  ChatResult,
  ChatService,
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
      create: (
        params: Omit<ChatParams, 'model'> & { model?: string },
      ) => Promise<ChatResult>;
    };
  };
} =>
  harden({
    chat: harden({
      completions: harden({
        async create(
          params: Omit<ChatParams, 'model'> & { model?: string },
        ): Promise<ChatResult> {
          const model = params.model ?? defaultModel;
          if (!model) {
            throw new Error('model is required');
          }
          return E(lmsRef).chat(harden({ ...params, model }));
        },
      }),
    }),
  });

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
