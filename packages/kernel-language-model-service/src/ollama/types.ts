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

type OllamaClient = {
  list: () => Promise<ListResponse>;
  generate: (
    request: GenerateRequest,
  ) => Promise<AbortableAsyncIterator<GenerateResponse>>;
};
export type { GenerateRequest, GenerateResponse, OllamaClient };

export type OllamaNodejsConfig = {
  endowments: { fetch: typeof fetch };
  clientConfig?: Partial<Omit<Config, 'fetch'>>;
};

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

export type OllamaModel = LanguageModel<OllamaModelOptions, GenerateResponse>;
