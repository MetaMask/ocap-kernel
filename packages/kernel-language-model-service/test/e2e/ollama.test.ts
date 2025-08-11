import { fetchMock } from '@ocap/test-utils';
import { expect, describe, it, beforeEach } from 'vitest';

import { OllamaNodejsLanguageModelService } from '../../src/ollama/nodejs.ts';

// This test connects to a local Ollama instance to test sampling capabilities.
const testConfig = {
  // Default model: 'llama3.2:latest'
  model: 'llama3.2:latest',
  // Default host: 'http://127.0.0.1:11434'
  host: 'http://127.0.0.1:11434',
};

describe('OllamaNodejsLanguageModelService E2E', { timeout: 10_000 }, () => {
  let service: OllamaNodejsLanguageModelService;

  beforeEach(async () => {
    // Disable fetch mocking for this test
    fetchMock.disableMocks();
    service = new OllamaNodejsLanguageModelService({
      endowments: { fetch: global.fetch },
      clientConfig: { host: testConfig.host },
    });
    fetchMock.enableMocks();
  });

  describe('makeInstance', () => {
    it('should create a model instance', async () => {
      const model = await service.makeInstance({ model: testConfig.model });
      expect(model).toBeDefined();
    });
  });

  describe('getModels', () => {
    it('should return a list of models', async () => {
      const { models } = await service.getModels();
      expect(models).toBeDefined();
      console.debug('@@@ models: ', models);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('complete', () => {
    it('should return a streaming result', async () => {
      const prompt = 'A B C';
      let completion = prompt;
      const instance = await service.makeInstance({ model: testConfig.model });
      const response = await instance.sample(prompt);
      let exitEarly = false;
      await Promise.all([
        (async () => {
          for await (const chunk of response) {
            if (exitEarly) {
              return;
            }
            completion += chunk.response;
          }
        })(),
        new Promise((resolve) =>
          setTimeout(() => {
            exitEarly = true;
            resolve(undefined);
          }),
        ),
      ]);
      console.debug('@@@ completion: ', completion);
      expect(completion).toContain(prompt);
      expect(completion.length).toBeGreaterThan(prompt.length);
    });
  });
});
