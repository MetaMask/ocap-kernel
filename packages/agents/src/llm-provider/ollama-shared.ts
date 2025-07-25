import type {
  ModelArchetype,
  InstanceConfig,
  LlmInstance,
  LlmProvider,
  Message,
  ModelConfig,
} from '../types.ts';
import { parseInstanceConfig } from '../utils.ts';

// Exported for testing.
export const defaultArchetypes: Record<ModelArchetype, string> = {
  general: 'llama3.2:latest',
  fast: 'llama3.2:latest',
  thinker: 'llama3.2:latest',
  'code:writer': 'llama3.2:latest',
  'code:reader': 'llama3.2:latest',
};

export type OllamaLlmProviderOptions = {
  archetypes?: Partial<Record<ModelArchetype, string>>;
};

type StreamedResponse<Content> = Promise<AsyncIterable<Content>>;

/**
 * The interface this library depends upon from `ollama[/browser]`.
 */
export type OllamaFace = {
  generate: (params: {
    prompt: string;
    stream: true;
  }) => StreamedResponse<{ response: string }>;
  chat: (params: {
    messages: Message[];
    stream: true;
  }) => StreamedResponse<{ message: { content: string } }>;
};

/**
 * Make an Ollama LLM provider.
 *
 * @param ollama - The Ollama instance to use.
 * @param options - The options for the Ollama LLM provider.
 * @param options.archetypes - The archetypes to use.
 * @returns An LlmProvider which uses the provided ollama instance.
 */
export function makeOllamaBaseLlmProvider(
  ollama: OllamaFace,
  options: OllamaLlmProviderOptions = {},
): LlmProvider {
  const archetypes = { ...defaultArchetypes, ...options.archetypes };
  return {
    /**
     * Get the configuration for an archetype.
     *
     * @param archetype - The archetype to get the configuration for.
     * @returns The configuration for the archetype.
     */
    getArchetypeConfig(archetype: ModelArchetype): ModelConfig {
      return { model: archetypes[archetype] };
    },
    /**
     * Make an LLM instance.
     *
     * @param config - The configuration for the LLM instance.
     * @returns An LLM instance.
     */
    async makeInstance(config: InstanceConfig): Promise<LlmInstance> {
      const requestParams = {
        ...parseInstanceConfig(config, archetypes),
        stream: true,
      } as const;
      return {
        /**
         * Generate text from the LLM.
         *
         * @param prompt - The prompt to generate text from.
         * @returns A generator of text chunks.
         */
        generate: async (prompt: string) => {
          const response = await ollama.generate({ prompt, ...requestParams });
          return (async function* () {
            for await (const chunk of response) {
              yield chunk.response;
            }
          })();
        },
        /**
         * Chat with the LLM.
         *
         * @param messages - The messages to chat with.
         * @returns A generator of message chunks.
         */
        chat: async (messages: Message[]) => {
          const response = await ollama.chat({ messages, ...requestParams });
          return (async function* () {
            for await (const chunk of response) {
              yield chunk.message.content;
            }
          })();
        },
      };
    },
  };
}
