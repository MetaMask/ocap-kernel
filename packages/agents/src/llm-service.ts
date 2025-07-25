import { E, Far } from '@endo/far';
import { makeFarGenerator } from '@metamask/streams/vat';

import type { Message, InstanceConfig, LlmProvider } from './types.ts';

/**
 * Connect to a local LLM instance.
 *
 * @param llmProvider - The LLM provider to use.
 * @returns An LLM instance.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeLlmService(llmProvider: LlmProvider) {
  return Far('LlmService', {
    makeInstance: async (config: InstanceConfig) => {
      const instance = await llmProvider.makeInstance(config);
      return Far('LlmInstance', {
        /**
         * Generate a response from the LLM.
         *
         * @param prompt - The prompt to generate a response for.
         * @returns An iterator that yields the response.
         */

        generate: async (prompt: string) => {
          const response = await instance.generate(prompt);
          return makeFarGenerator(response[Symbol.asyncIterator]());
        },
        /**
         * Chat with the LLM.
         *
         * @param messages - The messages to chat with.
         * @returns An iterator that yields the response.
         */

        chat: async (messages: Message[]) => {
          const response = await E(instance).chat(messages);
          return makeFarGenerator(response[Symbol.asyncIterator]());
        },
      });
    },
  });
}
