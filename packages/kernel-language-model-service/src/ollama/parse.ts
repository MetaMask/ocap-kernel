import {
  object,
  optional,
  number,
  size,
  string,
  assert,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

import type { ModelInfo } from '../types.ts';

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

export const OllamaInstanceConfigStruct = object({
  model: size(string(), 1, Infinity),
  options: optional(OllamaModelOptionsStruct),
});

export type OllamaModelOptions = Infer<typeof OllamaModelOptionsStruct>;
export type OllamaInstanceConfig = Infer<typeof OllamaInstanceConfigStruct>;

export const parseModelConfig = (
  config: OllamaInstanceConfig,
): ModelInfo<OllamaModelOptions> => {
  assert(config, OllamaInstanceConfigStruct);
  const { model, options } = config;
  return options ? { model, options } : { model };
};
