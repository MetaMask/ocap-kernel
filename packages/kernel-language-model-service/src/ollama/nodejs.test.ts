import { fetchMock } from '@ocap/test-utils';
import { expect, describe, it, beforeEach } from 'vitest';

import { OllamaNodejsLanguageModelService } from './nodejs.ts';
import { mockReadableStream } from '../../test/utils.ts';

describe('OllamaNodejsLanguageModelService', () => {
  let service: OllamaNodejsLanguageModelService;
  const archetype = 'fast';

  beforeEach(async () => {
    service = new OllamaNodejsLanguageModelService(
      { [archetype]: 'llama3.2:latest' },
      // For e2e tests, we need to run Ollama locally
      { host: 'http://127.0.0.1:11434' },
    );
  });

  describe('constructor', () => {
    const testArchetypes = { fast: 'llama3.2:latest' };
    it.each([
      ['undefined config', testArchetypes, undefined],
      ['empty config', testArchetypes, {}],
      ['basic config', testArchetypes, { host: 'http://127.0.0.1:11434' }],
    ])(
      'should create a service with the correct endowments: %s',
      (_testName, archetypes, config) => {
        const constructedService = new OllamaNodejsLanguageModelService(
          archetypes,
          config,
        );
        expect(constructedService).toBeDefined();
      },
    );
  });

  describe('makeInstance', () => {
    it('should create a model instance', async () => {
      const model = await service.makeInstance({ archetype });
      expect(model).toBeDefined();
    });
  });

  describe('getModels', () => {
    it('should return a list of models', async () => {
      const response = { models: [{ name: 'llama3.2:latest' }] };
      fetchMock.mockResponse({
        body: JSON.stringify(response),
      });
      const { models } = await service.getModels();
      expect(models).toMatchObject(response.models);
    });
  });

  describe('complete', () => {
    it('should stream a response', async () => {
      const response = 'world!';

      fetchMock.mockResponse({
        body: mockReadableStream([{ response }]),
      } as Parameters<typeof fetchMock.mockResponse>[0]);

      const instance = await service.makeInstance({ archetype });
      for await (const chunk of await instance.sample('Hello, ')) {
        expect(chunk).toMatchObject({
          response,
          done: true,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          done_reason: 'stop',
        });
      }
    });
  });
});
