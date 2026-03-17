import { assert } from '@metamask/superstruct';

import type { ChatParams, ChatResult, ChatStreamChunk } from '../types.ts';
import { ChatParamsStruct } from './types.ts';

/**
 * Base service for any Open /v1-compatible HTTP endpoint.
 *
 * Accepts an injected `fetch` endowment so it runs safely under lockdown.
 * Pass `stream: true` in params for SSE streaming; omit for a single JSON response.
 */
export class OpenV1BaseService {
  readonly #fetch: typeof globalThis.fetch;

  readonly #baseUrl: string;

  readonly #apiKey: string | undefined;

  /**
   * @param fetchFn - The fetch implementation to use for HTTP requests.
   * @param baseUrl - Base URL of the API (e.g. `'https://api.openai.com'`).
   * @param apiKey - Optional API key sent as a Bearer token.
   */
  constructor(
    fetchFn: typeof globalThis.fetch,
    baseUrl: string,
    apiKey?: string,
  ) {
    this.#fetch = fetchFn;
    this.#baseUrl = baseUrl;
    this.#apiKey = apiKey;
    harden(this);
  }

  /**
   * Performs a chat completion request against `/v1/chat/completions`.
   *
   * When `params.stream` is `true`, returns an async iterable of
   * {@link ChatStreamChunk}s, one per SSE event.
   * When `params.stream` is `false` or omitted, awaits and returns the full
   * {@link ChatResult}.
   *
   * @param params - The chat parameters.
   * @returns An async iterable of stream chunks when `stream: true`.
   */
  chat(params: ChatParams & { stream: true }): AsyncIterable<ChatStreamChunk>;

  /**
   * @param params - The chat parameters.
   * @returns A promise resolving to the full chat result.
   */
  chat(params: ChatParams & { stream?: false }): Promise<ChatResult>;

  /**
   * @param params - The chat parameters.
   * @returns An async iterable or promise depending on `params.stream`.
   */
  chat(
    params: ChatParams,
  ): AsyncIterable<ChatStreamChunk> | Promise<ChatResult> {
    assert(params, ChatParamsStruct);
    if (params.stream === true) {
      return this.#streamingChat(params);
    }
    return this.#nonStreamingChat(params);
  }

  /**
   * @param params - The chat parameters.
   * @returns A promise resolving to the full chat result.
   */
  async #nonStreamingChat(params: ChatParams): Promise<ChatResult> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.#makeHeaders(),
      body: JSON.stringify({ ...params, stream: false }),
    });
    const result = (await response.json()) as ChatResult;
    return harden(result);
  }

  /**
   * @param params - The chat parameters.
   * @yields One {@link ChatStreamChunk} per SSE event until `[DONE]`.
   */
  async *#streamingChat(params: ChatParams): AsyncGenerator<ChatStreamChunk> {
    const response = await this.#fetch(`${this.#baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.#makeHeaders(),
      body: JSON.stringify({ ...params, stream: true }),
    });
    if (!response.body) {
      throw new Error('No response body for streaming');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trimEnd();
          buffer = buffer.slice(newlineIdx + 1);
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            if (data) {
              yield harden(JSON.parse(data) as ChatStreamChunk);
            }
          }
        }
        if (done) {
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * @returns Headers for the request, including Authorization if an API key is set.
   */
  #makeHeaders(): Record<string, string> {
    return harden({
      'Content-Type': 'application/json',
      ...(this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {}),
    });
  }
}
