import type { GenerateResponse, ListResponse } from 'ollama';

import type {
  ChatParams,
  ChatResult,
  ChatRole,
  LanguageModelService,
  SampleParams,
  SampleResult,
} from '../types.ts';
import { parseModelConfig } from './parse.ts';
import type {
  OllamaInstanceConfig,
  OllamaModel,
  OllamaClient,
  OllamaModelOptions,
} from './types.ts';

/**
 * Base service for interacting with Ollama language models.
 * Provides a generic interface for creating and managing Ollama model instances.
 * This class implements the LanguageModelService interface and handles the
 * creation of hardened model instances that can be safely passed between vats.
 *
 * @template Ollama - The type of Ollama client to use
 */
export class OllamaBaseService<Ollama extends OllamaClient>
  implements
    LanguageModelService<
      OllamaModelOptions,
      OllamaModelOptions,
      GenerateResponse
    >
{
  readonly #makeClient: () => Promise<Ollama>;

  /**
   * Creates a new Ollama base service.
   *
   * @param makeClient - Factory function that creates an Ollama client instance
   */
  constructor(makeClient: () => Promise<Ollama>) {
    this.#makeClient = makeClient;
  }

  /**
   * Retrieves a list of available models from the Ollama server.
   *
   * @returns A promise that resolves to the list of available models
   */
  async getModels(): Promise<ListResponse> {
    const client = await this.#makeClient();
    return await client.list();
  }

  /**
   * Performs a chat completion request via the Ollama chat API.
   *
   * @param params - The chat parameters.
   * @returns A hardened chat result.
   */
  async chat(params: ChatParams): Promise<ChatResult> {
    const { model, messages, temperature, seed, stop } = params;
    const ollama = await this.#makeClient();
    let stopArr: string[] | undefined;
    if (stop !== undefined) {
      stopArr = Array.isArray(stop) ? stop : [stop];
    }
    const response = await ollama.chat({
      model,
      messages,
      stream: false,
      options: {
        ...(temperature !== undefined && { temperature }),
        ...(params.top_p !== undefined && { top_p: params.top_p }),
        ...(seed !== undefined && { seed }),
        ...(params.max_tokens !== undefined && {
          num_predict: params.max_tokens,
        }),
        ...(stopArr !== undefined && { stop: stopArr }),
      },
    });
    const promptTokens = response.prompt_eval_count ?? 0;
    const completionTokens = response.eval_count ?? 0;
    return harden({
      id: 'ollama-chat',
      model: response.model,
      choices: [
        {
          message: {
            role: response.message.role as ChatRole,
            content: response.message.content,
          },
          index: 0,
          finish_reason: response.done_reason ?? 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    });
  }

  /**
   * Performs a raw token-prediction request via Ollama's generate API with raw=true,
   * bypassing the model's chat template.
   *
   * @param params - The raw sample parameters.
   * @returns A hardened raw sample result.
   */
  async sample(params: SampleParams): Promise<SampleResult> {
    const { model, prompt, temperature, seed, stop } = params;
    const ollama = await this.#makeClient();
    let stopArr: string[] | undefined;
    if (stop !== undefined) {
      stopArr = Array.isArray(stop) ? stop : [stop];
    }
    const response = await ollama.generate({
      model,
      prompt,
      raw: true,
      stream: false,
      options: {
        ...(temperature !== undefined && { temperature }),
        ...(params.top_p !== undefined && { top_p: params.top_p }),
        ...(seed !== undefined && { seed }),
        ...(params.max_tokens !== undefined && {
          num_predict: params.max_tokens,
        }),
        ...(stopArr !== undefined && { stop: stopArr }),
      },
    });
    return harden({ text: response.response });
  }

  /**
   * Creates a new language model instance with the specified configuration.
   * The returned instance is hardened for object capability security.
   *
   * @param config - The configuration for the model instance
   * @returns A promise that resolves to a hardened language model instance
   */
  async makeInstance(config: OllamaInstanceConfig): Promise<OllamaModel> {
    const modelInfo = parseModelConfig(config);
    const { model } = modelInfo;
    const ollama = await this.#makeClient();
    const defaultOptions = {
      ...(config.options ?? {}),
    };
    const mandatoryOptions = {
      model,
      stream: true as const,
      raw: true,
    };

    const instance = {
      getInfo: async () => modelInfo,
      load: async () => {
        await ollama.generate({ model, keep_alive: -1, prompt: '' });
      },
      unload: async () => {
        await ollama.generate({ model, keep_alive: 0, prompt: '' });
      },
      sample: async (prompt: string, options?: Partial<OllamaModelOptions>) => {
        const response = await ollama.generate({
          ...defaultOptions,
          ...(options ?? {}),
          ...mandatoryOptions,
          prompt,
        });
        return {
          stream: (async function* () {
            for await (const chunk of response) {
              yield chunk;
            }
          })(),
          abort: async () => response.abort(),
        };
      },
    };
    return harden(instance);
  }
}
