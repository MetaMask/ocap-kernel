import { Ollama } from 'ollama';

import type { LlmProvider } from '../types.ts';
import { makeOllamaBaseLlmProvider } from './ollama-shared.ts';
import type { OllamaFace, OllamaLlmProviderOptions } from './ollama-shared.ts';

/**
 * Make an LLM provider that uses the ollama library.
 *
 * @param ollama - The Ollama instance to use.
 * @param options - The options for the LLM provider.
 * @returns An LLM provider that uses the Ollama library.
 */
export function makeOllamaLlmProvider(
  ollama: Ollama,
  options: OllamaLlmProviderOptions = {},
): LlmProvider {
  return makeOllamaBaseLlmProvider(ollama as unknown as OllamaFace, options);
}
