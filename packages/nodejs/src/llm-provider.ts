import { Far } from '@endo/far';
import type {
  ModelArchetype,
  InstanceConfig,
  LlmInstance,
  LlmProvider,
  Message,
  ModelConfig,
} from '@ocap/agents';
import { parseInstanceConfig } from '@ocap/agents';
import { Ollama } from 'ollama';

// Exported for testing.
export const defaultArchetypes: Record<ModelArchetype, string> = {
  general: 'llama3.2:latest',
  fast: 'llama3.2:latest',
  thinker: 'llama3.2:latest',
  'code:writer': 'llama3.2:latest',
  'code:reader': 'llama3.2:latest',
};

type OllamaLlmProviderOptions = {
  archetypes?: Partial<Record<ModelArchetype, string>>;
};

/**
 * Make an Ollama LLM provider.
 *
 * @param ollama - The Ollama instance to use.
 * @param options - The options for the Ollama LLM provider.
 * @param options.archetypes - The archetypes to use.
 * @returns An LlmProvider which uses the provided ollama instance.
 */
export function makeOllamaLlmProvider(
  ollama: Ollama,
  options: OllamaLlmProviderOptions = {},
): LlmProvider {
  const archetypes = { ...defaultArchetypes, ...options.archetypes };

  return Far('LlmProvider', {
    async makeInstance(config: InstanceConfig): Promise<LlmInstance> {
      const { model } = parseInstanceConfig(config, archetypes);
      const requestParams = { model, stream: true } as const;
      return Far('LlmInstance', {
        generate: async (prompt: string) => {
          const response = await ollama.generate({ prompt, ...requestParams });
          return (async function* () {
            for await (const chunk of response) {
              yield chunk.response;
            }
          })();
        },
        chat: async (messages: Message[]) => {
          const response = await ollama.chat({ messages, ...requestParams });
          return (async function* () {
            for await (const chunk of response) {
              yield chunk.message.content;
            }
          })();
        },
      });
    },
    async getArchetypeConfig(archetype: ModelArchetype): Promise<ModelConfig> {
      return { model: archetypes[archetype] };
    },
  });
}
