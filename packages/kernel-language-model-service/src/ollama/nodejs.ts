import { Ollama } from 'ollama';

import { OllamaBaseLanguageModelService } from './base.ts';
import { defaultClientConfig } from './constants.ts';
import type { OllamaClient, OllamaNodejsConfig } from './types.ts';

export class OllamaNodejsLanguageModelService extends OllamaBaseLanguageModelService<OllamaClient> {
  constructor({ endowments, clientConfig = {} }: OllamaNodejsConfig) {
    if (!endowments?.fetch) {
      throw new Error('Must endow a fetch implementation.');
    }
    const resolvedConfig = { ...defaultClientConfig, ...clientConfig };
    super(
      async () =>
        new Ollama({
          ...resolvedConfig,
          fetch: endowments.fetch,
        }) as OllamaClient,
    );
  }
}
