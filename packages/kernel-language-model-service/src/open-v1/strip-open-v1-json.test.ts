import { describe, expect, it } from 'vitest';

import {
  stripChatResultJson,
  stripChatStreamChunkJson,
  stripListModelsResponseJson,
} from './strip-open-v1-json.ts';

describe('stripChatResultJson', () => {
  it('drops top-level provider fields before strict validation', () => {
    const stripped = stripChatResultJson({
      object: 'chat.completion',
      id: 'chat-1',
      model: 'm',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          logprobs: null,
          message: {
            role: 'assistant',
            content: 'hi',
            refusal: null,
          },
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      },
    });
    expect(stripped).toStrictEqual({
      id: 'chat-1',
      model: 'm',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'hi' },
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      },
    });
  });
});

describe('stripListModelsResponseJson', () => {
  it('keeps only model id entries', () => {
    const stripped = stripListModelsResponseJson({
      object: 'list',
      data: [
        {
          id: 'llama3.1:latest',
          object: 'model',
          created: 123,
          owned_by: 'library',
        },
      ],
    });
    expect(stripped).toStrictEqual({
      data: [{ id: 'llama3.1:latest' }],
    });
  });
});

describe('stripChatStreamChunkJson', () => {
  it('drops extra keys on stream events', () => {
    const stripped = stripChatStreamChunkJson({
      object: 'chat.completion.chunk',
      id: 'c1',
      model: 'm',
      choices: [
        {
          index: 0,
          finish_reason: null,
          logprobs: null,
          delta: { content: 'x', role: 'assistant' },
        },
      ],
    });
    expect(stripped).toStrictEqual({
      id: 'c1',
      model: 'm',
      choices: [
        {
          index: 0,
          finish_reason: null,
          delta: { content: 'x', role: 'assistant' },
        },
      ],
    });
  });
});
