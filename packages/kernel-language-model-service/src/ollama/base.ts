import type { GenerateResponse, ListResponse } from 'ollama';

import type { LanguageModelService } from '../types.ts';
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
      stream: true,
      raw: true,
    };

    const instance = {
      getInfo: async () => modelInfo,
      load: async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await ollama.generate({ model, keep_alive: -1, prompt: '' });
      },
      unload: async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
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
