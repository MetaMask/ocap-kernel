import '@ocap/test-utils/mock-endoify';
import { expect, describe, it, beforeEach, vi } from 'vitest';

import { makeLlmService } from './llm-service.ts';
import type { LlmProvider } from './types.ts';

const mocks = vi.hoisted(() => ({
  makeFarGenerator: vi.fn(),
}));

describe('llm', () => {
  let llmProvider: LlmProvider;

  beforeEach(async () => {
    llmProvider = {
      makeInstance: async () => ({
        generate: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: vi.fn(),
        }),
        chat: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: vi.fn(),
        }),
      }),
      getArchetypeConfig: () => ({ model: 'test' }),
    };
  });

  vi.mock('ollama/browser', () => ({
    Ollama: vi.fn(() => ({
      generate: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: vi.fn(),
      }),
      chat: vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]: vi.fn(),
      }),
    })),
  }));

  vi.mock('@metamask/streams/vat', () => ({
    makeFarGenerator: mocks.makeFarGenerator,
  }));

  vi.mock('@endo/far', () => ({
    E: vi.fn((obj) => obj),
    Far: vi.fn((_name, methods) => ({ ...methods })),
  }));

  describe('makeLlmService', () => {
    it('should return an object with generate and chat methods', async () => {
      const llmService = makeLlmService(llmProvider);
      const llm = await llmService.makeInstance({ archetype: 'fast' });
      expect(llm).toMatchObject({
        generate: expect.any(Function),
        chat: expect.any(Function),
      });
    });

    it.each([
      ['generate', ''],
      ['chat', []],
    ])(
      'should promise a FarGenerator from its %s method',
      async (method, args) => {
        const llmService = makeLlmService(llmProvider);
        const llm = await llmService.makeInstance({ archetype: 'fast' });
        // @ts-expect-error The underlying ollama library is mocked in these tests
        const result = await llm[method as keyof typeof llm](args);
        expect(mocks.makeFarGenerator).toHaveBeenCalledOnce();
        expect(mocks.makeFarGenerator.mock.calls?.[0]).toMatchObject([result]);
      },
    );
  });
});
