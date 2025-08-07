import { Ollama } from 'ollama';
import type { Config } from 'ollama';

import { OllamaBaseLanguageModelService } from './base.ts';
import { defaultConfig } from './constants.ts';
import type { OllamaClient } from './types.ts';

const makeOllamaClient = (config: typeof defaultConfig): OllamaClient =>
  new Ollama(config) as OllamaClient;

export class OllamaNodejsLanguageModelService extends OllamaBaseLanguageModelService<OllamaClient> {
  constructor(
    archetypes: Record<string, string>,
    config: Partial<Config> = {},
  ) {
    // We use ignore because this is only a ts-error in Node 20, not in Node 22.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore globalThis.fetch is untyped in Node 20, but proper in Node 22.
    const endowments = { fetch };
    super(archetypes, async () =>
      makeOllamaClient({ ...defaultConfig, ...config, ...endowments }),
    );
  }
}
