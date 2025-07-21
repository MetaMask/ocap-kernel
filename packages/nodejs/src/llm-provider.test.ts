import '@ocap/test-utils/mock-endoify';
import type { ModelArchetype } from '@metamask/agents';
import { Ollama } from 'ollama';
import { expect, describe, it, beforeEach, vi } from 'vitest';

import { defaultArchetypes, makeOllamaLlmProvider } from './llm-provider.ts';

vi.mock('ollama', () => ({
  Ollama: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue(
      (async function* () {
        yield { response: 'test' };
      })(),
    ),
    chat: vi.fn().mockResolvedValue(
      (async function* () {
        yield { message: { content: 'test' } };
      })(),
    ),
  })),
}));

vi.mock('@endo/far', () => ({
  Far: vi.fn((_name, methods) => ({ ...methods })),
}));

describe('OllamaLlmProvider', () => {
  let ollama: Ollama;
  beforeEach(async () => {
    ollama = new Ollama();
  });

  it.each(Object.keys(defaultArchetypes))(
    'constructor should create a default archetype map for %s',
    async (archetype) => {
      const llmProvider = makeOllamaLlmProvider(ollama);
      const config = await llmProvider.getArchetypeConfig(
        archetype as ModelArchetype,
      );
      expect(config).toMatchObject({
        model: defaultArchetypes[archetype as ModelArchetype],
      });
    },
  );

  it.each(Object.keys(defaultArchetypes))(
    'constructor should allow an archetype to be provided',
    async (archetype) => {
      const llmProvider = makeOllamaLlmProvider(ollama, {
        archetypes: { [archetype]: 'test' },
      });
      const config = await llmProvider.getArchetypeConfig(
        archetype as ModelArchetype,
      );
      expect(config).toMatchObject({ model: 'test' });
    },
  );

  describe('makeInstance', () => {
    it('should create an instance for a model', async () => {
      const llmProvider = makeOllamaLlmProvider(ollama);
      const instance = await llmProvider.makeInstance({ archetype: 'fast' });
      expect(instance).toHaveProperty('generate');
      expect(instance).toHaveProperty('chat');
    });

    it.each([
      ['generate', ''],
      ['chat', []],
    ])(
      'method %s should yield from the ollama method',
      async (method, args) => {
        const llmProvider = makeOllamaLlmProvider(ollama);
        const instance = await llmProvider.makeInstance({ archetype: 'fast' });
        const result = await instance[method as keyof typeof instance](
          args as never,
        );
        expect(result[Symbol.asyncIterator]).toBeDefined();
        let chunkCount = 0;
        for await (const chunk of result) {
          expect(chunk).toBe('test');
          chunkCount += 1;
        }
        expect(chunkCount).toBe(1);
      },
    );
  });
});
