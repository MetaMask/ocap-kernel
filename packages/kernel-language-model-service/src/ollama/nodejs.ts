import { Ollama } from 'ollama';

import { OllamaBaseLanguageModelService } from './base.ts';
import { defaultConfig } from './constants.ts';
import type { OllamaClient, OllamaNodejsConfig } from './types.ts';

export class OllamaNodejsLanguageModelService extends OllamaBaseLanguageModelService<OllamaClient> {
  constructor({
    archetypes,
    endowments,
    clientConfig = {},
  }: OllamaNodejsConfig) {
    if (!endowments?.fetch) {
      throw new Error('Must endow a fetch implementation.');
    }
    const resolvedConfig = { ...defaultConfig, ...clientConfig };
    super(
      archetypes,
      async () =>
        new Ollama({
          ...resolvedConfig,
          fetch: endowments.fetch,
        }) as OllamaClient,
    );
  }
}
