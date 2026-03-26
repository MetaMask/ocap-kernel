import { Ollama } from 'ollama';

import type {
  ChatParams,
  ChatResult,
  SampleParams,
  SampleResult,
} from '../types.ts';
import { OllamaBaseService } from './base.ts';
import { defaultClientConfig } from './constants.ts';
import type { OllamaClient, OllamaNodejsConfig } from './types.ts';

/**
 * Node.js-specific implementation of the Ollama service.
 * Extends OllamaBaseService to provide a concrete implementation for Node.js environments.
 * Requires an explicit fetch endowment.
 */
export class OllamaNodejsService extends OllamaBaseService<OllamaClient> {
  /**
   * Creates a new Ollama Node.js service.
   *
   * @param config - The configuration for the service
   * @param config.endowments - Required endowments for the service
   * @param config.endowments.fetch - The fetch implementation to use for HTTP requests
   * @param config.clientConfig - Optional configuration for the Ollama client
   * @throws {Error} When fetch is not provided in endowments
   */
  constructor(config: OllamaNodejsConfig) {
    const { endowments, clientConfig = {} } = config;
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

/**
 * Creates a hardened kernel service backend backed by a local Ollama instance.
 *
 * @param config - Configuration for the Ollama Node.js service.
 * @returns An object with `chat` and `sample` methods for use with
 *   `makeKernelLanguageModelService`.
 */
export const makeOllamaNodejsKernelService = (
  config: OllamaNodejsConfig,
): {
  chat: (params: ChatParams) => Promise<ChatResult>;
  sample: (params: SampleParams) => Promise<SampleResult>;
} => {
  const service = new OllamaNodejsService(config);
  return harden({
    chat: async (params: ChatParams) => service.chat(params),
    sample: async (params: SampleParams) => service.sample(params),
  });
};
