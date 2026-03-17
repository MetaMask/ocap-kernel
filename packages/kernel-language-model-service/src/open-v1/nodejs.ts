import type { ChatParams, ChatResult, ChatStreamChunk } from '../types.ts';
import { OpenV1BaseService } from './base.ts';

/**
 * Creates an Open /v1-compatible service for Node.js environments.
 *
 * Requires `fetch` to be explicitly endowed for object-capability security.
 *
 * Pass `stream: true` in params for SSE streaming; omit for a single JSON response.
 *
 * @param config - Configuration for the service.
 * @param config.endowments - Required endowments.
 * @param config.endowments.fetch - The fetch implementation to use for HTTP requests.
 * @param config.baseUrl - Base URL of the API (e.g. `'https://api.openai.com'`).
 * @param config.apiKey - Optional API key sent as a Bearer token.
 * @returns An object with a `chat` method. Raw sampling is not supported by this backend.
 */
export const makeOpenV1NodejsService = (config: {
  endowments: { fetch: typeof globalThis.fetch };
  baseUrl: string;
  apiKey?: string;
}): {
  chat: {
    (params: ChatParams & { stream: true }): AsyncIterable<ChatStreamChunk>;
    (params: ChatParams & { stream?: false }): Promise<ChatResult>;
  };
} => {
  const { endowments, baseUrl, apiKey } = config;
  if (!endowments?.fetch) {
    throw new Error('Must endow a fetch implementation.');
  }
  const service = new OpenV1BaseService(endowments.fetch, baseUrl, apiKey);
  return harden({
    chat: service.chat.bind(service) as {
      (params: ChatParams & { stream: true }): AsyncIterable<ChatStreamChunk>;
      (params: ChatParams & { stream?: false }): Promise<ChatResult>;
    },
  });
};
