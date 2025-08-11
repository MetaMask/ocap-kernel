import type {
  GenerateRequest,
  GenerateResponse,
  ListResponse,
  AbortableAsyncIterator,
  Config,
} from 'ollama';

type OllamaClient = {
  list: () => Promise<ListResponse>;
  generate: (
    request: GenerateRequest,
  ) => Promise<AbortableAsyncIterator<GenerateResponse>>;
};
export type { GenerateRequest, GenerateResponse, OllamaClient };

export type OllamaModelOptions = {
  // Ollama is pythonic, using snake_case for its options.
  /* eslint-disable @typescript-eslint/naming-convention */
  temperature: number;
  top_p: number;
  top_k: number;
  repeat_penalty: number;
  repeat_last_n: number;
  seed: number;
  num_ctx: number;
  /* eslint-enable @typescript-eslint/naming-convention */
};

export type OllamaNodejsConfig = {
  endowments: { fetch: typeof fetch };
  clientConfig?: Partial<Omit<Config, 'fetch'>>;
};
