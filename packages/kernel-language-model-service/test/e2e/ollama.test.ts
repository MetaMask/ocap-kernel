import { fetchMock } from '@ocap/repo-tools/test-utils';
import { expect, describe, it, beforeEach } from 'vitest';

import { makeHostRestrictedFetch } from '../../src/ollama/fetch.ts';
import { OllamaNodejsService } from '../../src/ollama/nodejs.ts';
import type { OllamaModel } from '../../src/ollama/types.ts';

// This test connects to a local Ollama instance to test sampling capabilities.
const testConfig = {
  // Default model: 'llama3.2:latest'
  model: 'llama3.2:latest',
  // Default host: 'http://127.0.0.1:11434'
  host: '127.0.0.1:11434',
};

describe('OllamaNodejsService E2E', { timeout: 10_000 }, () => {
  let service: OllamaNodejsService;
  const { model, host } = testConfig;

  beforeEach(async () => {
    // Disable fetch mocking for this test
    fetchMock.disableMocks();
    service = new OllamaNodejsService({
      endowments: { fetch: makeHostRestrictedFetch([host], fetch) },
      clientConfig: { host: `http://${host}` },
    });
    fetchMock.enableMocks();
  });

  describe('makeInstance', () => {
    it('should create a model instance', async () => {
      const instance = await service.makeInstance({ model });
      expect(instance).toBeDefined();
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

  describe('instance', () => {
    let instance: OllamaModel;

    beforeEach(async () => {
      instance = await service.makeInstance({ model });
    });

    describe('sample', () => {
      it('should return a streaming result', async () => {
        const prompt = 'A B C';
        let completion = prompt;
        const { stream, abort } = await instance.sample(prompt);
        try {
          for await (const chunk of stream) {
            completion += chunk.response;
          }
        } finally {
          await abort();
        }
        console.debug('@@@ sample: ', completion);
        expect(completion).toContain(prompt);
        expect(completion.length).toBeGreaterThan(prompt.length);
      });
    });

    describe('load', () => {
      it('should load a model without generating a response', async () => {
        const response = await instance.load();
        // ToDo: check that the model is loaded
        expect(response).toBeUndefined();
      });
    });

    describe('unload', () => {
      it('should unload a model without generating a response', async () => {
        const response = await instance.unload();
        // ToDo: check that the model is unloaded
        expect(response).toBeUndefined();
      });
    });
  });
});
