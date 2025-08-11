import type { GenerateRequest, GenerateResponse } from 'ollama';

import type {
  InstanceConfig,
  LanguageModel,
  LanguageModelService,
} from '../types.ts';
import { parseModelConfig } from './parse.ts';
import type { OllamaClient, OllamaModelOptions } from './types.ts';

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

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getModels() {
    const client = await this.#makeClient();
    return await client.list();
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async makeInstance(config: InstanceConfig<OllamaModelOptions>) {
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
        await ollama.generate({ model, keep_alive: -1 } as GenerateRequest);
      },
      unload: async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await ollama.generate({ model, keep_alive: 0 } as GenerateRequest);
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
    return instance as LanguageModel<OllamaModelOptions, GenerateResponse>;
  }
}
