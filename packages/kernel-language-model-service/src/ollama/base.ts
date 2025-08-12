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
 * It is recommended to create an Ollama client per model session.
 */
export class OllamaBaseLanguageModelService<Ollama extends OllamaClient>
  implements
    LanguageModelService<
      OllamaModelOptions,
      OllamaModelOptions,
      GenerateResponse
    >
{
  readonly #makeClient: () => Promise<Ollama>;

  constructor(makeClient: () => Promise<Ollama>) {
    this.#makeClient = makeClient;
  }

  async getModels(): Promise<ListResponse> {
    const client = await this.#makeClient();
    return await client.list();
  }

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
        return (async function* () {
          for await (const chunk of response) {
            yield chunk;
          }
        })();
      },
    };
    return harden(instance);
  }
}
