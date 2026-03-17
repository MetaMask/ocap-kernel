import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ChatResult, ChatStreamChunk } from '../types.ts';
import { OpenV1BaseService } from './base.ts';

const MODEL = 'glm-4.7-flash';

const makeChatResult = (): ChatResult => ({
  id: 'chat-1',
  model: MODEL,
  choices: [
    {
      message: { role: 'assistant', content: 'hi there' },
      index: 0,
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
});

const makeMockFetch = (json: unknown): typeof globalThis.fetch =>
  vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue(json) });

const makeSSEStream = (
  chunks: ChatStreamChunk[],
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const lines = chunks
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('');
  const body = `${lines}data: [DONE]\n\n`;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
};

const makeStreamChunk = (content: string): ChatStreamChunk => ({
  id: 'chat-1',
  model: MODEL,
  choices: [{ delta: { content }, index: 0, finish_reason: null }],
});

const makeMockStreamFetch = (
  chunks: ChatStreamChunk[],
): typeof globalThis.fetch =>
  vi.fn().mockResolvedValue({ body: makeSSEStream(chunks) });

describe('OpenV1BaseService', () => {
  let service: OpenV1BaseService;
  let mockFetch: ReturnType<typeof makeMockFetch>;

  beforeEach(() => {
    mockFetch = makeMockFetch(makeChatResult());
    service = new OpenV1BaseService(
      mockFetch,
      'http://localhost:11434',
      'sk-test',
    );
  });

  describe('chat', () => {
    it('pOSTs to /v1/chat/completions with serialized params', async () => {
      const params = {
        model: MODEL,
        messages: [{ role: 'user' as const, content: 'hello' }],
      };
      await service.chat(params);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ...params, stream: false }),
        }),
      );
    });

    it('sends stream: false when stream is not set', async () => {
      await service.chat({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const [, init] = (mockFetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toMatchObject({ stream: false });
    });

    it('includes Authorization header when apiKey is set', async () => {
      await service.chat({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const [, init] = (mockFetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk-test',
      );
    });

    it('omits Authorization header when no apiKey', async () => {
      const noKeyFetch = makeMockFetch(makeChatResult());
      const noKeyService = new OpenV1BaseService(
        noKeyFetch,
        'http://localhost:11434',
      );
      await noKeyService.chat({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      });

      const [, init] = (noKeyFetch as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, RequestInit];
      expect(
        (init.headers as Record<string, string>).Authorization,
      ).toBeUndefined();
    });

    it('returns the parsed JSON response', async () => {
      const expected = makeChatResult();
      mockFetch = makeMockFetch(expected);
      service = new OpenV1BaseService(mockFetch, 'http://localhost:11434');

      const result = await service.chat({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result).toStrictEqual(expected);
    });

    it('throws on invalid params (empty model)', () => {
      expect(() => {
        // eslint-disable-next-line no-void
        void service.chat({
          model: '',
          messages: [{ role: 'user', content: 'hi' }],
        });
      }).toThrow('Expected a string with a length between');
    });

    it('throws on invalid params (invalid role)', () => {
      expect(() => {
        // eslint-disable-next-line no-void
        void service.chat({
          model: MODEL,
          messages: [{ role: 'unknown' as never, content: 'hi' }],
        });
      }).toThrow('Expected the value to satisfy a union');
    });

    it('uses custom baseUrl', async () => {
      const customFetch = makeMockFetch(makeChatResult());
      const customService = new OpenV1BaseService(
        customFetch,
        'https://my-llm.internal',
      );
      await customService.chat({
        model: 'my-model',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(customFetch).toHaveBeenCalledWith(
        'https://my-llm.internal/v1/chat/completions',
        expect.any(Object),
      );
    });
  });

  describe('chat with stream: true', () => {
    it('pOSTs to /v1/chat/completions with stream: true in body', async () => {
      const streamFetch = makeMockStreamFetch([makeStreamChunk('hi')]);
      const streamService = new OpenV1BaseService(
        streamFetch,
        'http://localhost:11434',
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of streamService.chat({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      })) {
        // drain
      }

      expect(streamFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: 'hi' }],
            stream: true,
          }),
        }),
      );
    });

    it('yields parsed chunks and stops at [DONE]', async () => {
      const expected = [makeStreamChunk('Hello'), makeStreamChunk(', world!')];
      const streamFetch = makeMockStreamFetch(expected);
      const streamService = new OpenV1BaseService(
        streamFetch,
        'http://localhost:11434',
      );

      const received: ChatStreamChunk[] = [];
      for await (const chunk of streamService.chat({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      })) {
        received.push(chunk);
      }

      expect(received).toStrictEqual(expected);
    });

    it('throws when response body is null', async () => {
      const nullBodyFetch: typeof globalThis.fetch = vi
        .fn()
        .mockResolvedValue({ body: null });
      const streamService = new OpenV1BaseService(
        nullBodyFetch,
        'http://localhost:11434',
      );

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of streamService.chat({
          model: MODEL,
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        })) {
          // drain
        }
      }).rejects.toThrow('No response body for streaming');
    });
  });
});
