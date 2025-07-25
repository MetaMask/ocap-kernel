import { Ollama } from 'ollama/browser';

import { makeOllamaBaseLlmProvider } from './ollama-shared.ts';
import type { OllamaFace, OllamaLlmProviderOptions } from './ollama-shared.ts';
import type { LlmProvider } from '../types.ts';

/**
 * Make an LLM provider that uses the `ollama/browser` import from ollama.
 *
 * @see https://ollama.com/
 *
 * @param ollama - The Ollama instance to use.
 * @param options - The options for the LLM provider.
 * @returns An LLM provider that uses an `ollama/browser` client.
 */
export function makeOllamaBrowserLlmProvider(
  ollama: Ollama,
  options: OllamaLlmProviderOptions = {},
): LlmProvider {
  return makeOllamaBaseLlmProvider(ollama as unknown as OllamaFace, options);
}
