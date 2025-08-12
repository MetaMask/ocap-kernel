import { assert } from '@metamask/superstruct';

import type { ModelInfo } from '../types.ts';
import { OllamaInstanceConfigStruct } from './types.ts';
import type { OllamaInstanceConfig, OllamaModelOptions } from './types.ts';

/**
 * Parse the Ollama model configuration.
 *
 * @param config - The configuration to parse.
 * @returns The model info struct describing an Ollama model.
 */
export const parseModelConfig = (
  config: OllamaInstanceConfig,
): ModelInfo<OllamaModelOptions> => {
  assert(config, OllamaInstanceConfigStruct);
  const { model, options } = config;
  return options ? { model, options } : { model };
};
