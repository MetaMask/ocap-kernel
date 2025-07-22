// TODO: use @metamask/superstruct

import type { defaultArchetypes } from './constants.ts';

export type ModelName = string;
export type ModelConfig = {
  model: ModelName;
  thinking?: boolean;
  contextWindowSize?: number;
};

export type Message = { role: string; content: string };

/**
 * The recognized language model archetypes provide a loose categorization of
 * models by capability and behavior.
 */
export type ModelArchetype = keyof typeof defaultArchetypes;

/**
 * The interface that language model providers must implement to be used by the
 * agents package.
 * The generate method is used to access raw completion results.
 * The chat method is used to access chat-like interactions, which benefit from
 * the context of previous messages remaining loaded in memory.
 * Both methods are expected to stream results as they are generated, but a
 * vexed provider may yield a single chunk containing the entire response.
 */
export type LlmInstance = {
  generate: (prompt: string) => Promise<AsyncGenerator<string>>;
  chat: (messages: Message[]) => Promise<AsyncGenerator<string>>;
};

/**
 * In some cases, we may be able to address a model by name. But having seen a
 * `vicuna-7b-instruct-distil-qwen-quantized-version-1.2-8k` in the wild, we
 * should not expect different providers to map the same name to the same model.
 *
 * Providers are required to implement each archetype, but they are not required
 * to do so well; they may return the same model for every archetype. The
 * archetype is a hint to the provider what kind of context the model will be
 * used in. Supposing the provider wishes their models to provide good results,
 * an opinionated implementation of each archetype
 */
export type InstanceConfig =
  | {
      model: ModelName;
      archetype?: never;
    }
  | {
      model?: never;
      archetype: ModelArchetype;
    };

/**
 * A provider is a factory for language model instances.
 */
export type LlmProvider = {
  makeInstance: (config: InstanceConfig) => Promise<LlmInstance>;
  getArchetypeConfig: (archetype: ModelArchetype) => ModelConfig;
};
