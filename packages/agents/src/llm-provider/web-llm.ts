import { CreateMLCEngine } from '@mlc-ai/web-llm';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletion,
  MLCEngineConfig,
} from '@mlc-ai/web-llm';

import type {
  InstanceConfig,
  LlmInstance,
  LlmProvider,
  ModelArchetype,
  Message,
  ModelConfig,
} from '../types.ts';
import { parseInstanceConfig } from '../utils.ts';

const defaultArchetypes: Record<ModelArchetype, string> = {
  general: 'llama3.2:latest',
  fast: 'llama3.2:latest',
  thinker: 'deepseek-r1:3b',
  'code:writer': 'llama3.2:latest',
  'code:reader': 'llama3.2:latest',
};

export type MlcLlmProviderOptions = {
  archetypes?: Partial<Record<ModelArchetype, string>>;
  engineConfig?: MLCEngineConfig;
};

/**
 * Make an LLM provider that uses the `@mlc-ai/web-llm` library.
 *
 * @param options - The options to configure the mlc-ai/web-llm engine.
 * @param options.archetypes - The archetypes to use.
 * @returns An LLM provider that uses the `@mlc-ai/web-llm` library.
 */
export function makeMlcLlmProvider(
  options: MlcLlmProviderOptions = {},
): LlmProvider {
  const archetypes = { ...defaultArchetypes, ...options.archetypes };
  const engineParams = options.engineConfig ? [options.engineConfig] : [];

  return {
    getArchetypeConfig(archetype: ModelArchetype): ModelConfig {
      return { model: archetypes[archetype] };
    },
    async makeInstance(config: InstanceConfig): Promise<LlmInstance> {
      const { model } = parseInstanceConfig(config, archetypes);
      const engine = await CreateMLCEngine(...[model, ...engineParams]);
      const requestParams = {
        stream: true,
        // The library is written in parselmouth.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        stream_options: { include_usage: false },
      };
      return {
        generate: async (prompt: string): Promise<AsyncGenerator<string>> => {
          const response = (await engine.completions.create({
            prompt,
            ...requestParams,
          })) as AsyncIterable<ChatCompletion>;
          return (async function* () {
            for await (const chunk of response) {
              const content = chunk.choices[0]?.message.content;
              if (!content) {
                throw new Error('No content in chunk');
              }
              yield content;
            }
          })();
        },

        chat: async (messages: Message[]): Promise<AsyncGenerator<string>> => {
          const response = (await engine.chat.completions.create({
            messages,
            ...requestParams,
          } as ChatCompletionRequest)) as AsyncIterable<ChatCompletionChunk>;
          return (async function* () {
            for await (const chunk of response) {
              const content = chunk.choices[0]?.delta.content;
              if (!content) {
                throw new Error('No content in chunk');
              }
              yield content;
            }
          })();
        },
      };
    },
  };
}
