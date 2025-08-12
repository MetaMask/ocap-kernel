import { object, optional, number, size, string } from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import type {
  GenerateRequest,
  GenerateResponse,
  ListResponse,
  AbortableAsyncIterator,
  Config,
} from 'ollama';

import type { LanguageModel } from '../types.ts';

/**
 * Interface for an Ollama client that can list models and generate responses.
 * Provides the minimal interface required for Ollama operations.
 */
type OllamaClient = {
  list: () => Promise<ListResponse>;
  generate: (
    request: GenerateRequest,
  ) => Promise<AbortableAsyncIterator<GenerateResponse>>;
};
export type { GenerateRequest, GenerateResponse, OllamaClient };

/**
 * Configuration for creating an Ollama service in a Node.js environment.
 * Requires a fetch implementation to be provided as an endowment for security.
 */
export type OllamaNodejsConfig = {
  endowments: { fetch: typeof fetch };
  clientConfig?: Partial<Omit<Config, 'fetch'>>;
};

/**
 * Superstruct schema for Ollama model options.
 * Defines the validation rules for model generation parameters.
 *
 * Note: Uses snake_case to match Ollama's Python-style API.
 */
export const OllamaModelOptionsStruct = object({
  // Ollama is pythonic, using snake_case for its options.
  /* eslint-disable @typescript-eslint/naming-convention */
  temperature: optional(number()),
  top_p: optional(number()),
  top_k: optional(number()),
  repeat_penalty: optional(number()),
  repeat_last_n: optional(number()),
  seed: optional(number()),
  num_ctx: optional(number()),
  /* eslint-enable @typescript-eslint/naming-convention */
});

/**
 * Superstruct schema for Ollama instance configuration.
 * Validates that the model name is a non-empty string.
 */
export const OllamaInstanceConfigStruct = object({
  model: size(string(), 1, Infinity),
  options: optional(OllamaModelOptionsStruct),
});

/**
 * Type representing valid Ollama model options.
 */
export type OllamaModelOptions = Infer<typeof OllamaModelOptionsStruct>;

/**
 * Type representing valid Ollama instance configuration.
 */
export type OllamaInstanceConfig = Infer<typeof OllamaInstanceConfigStruct>;

/**
 * Type representing an Ollama language model instance.
 */
export type OllamaModel = LanguageModel<OllamaModelOptions, GenerateResponse>;
