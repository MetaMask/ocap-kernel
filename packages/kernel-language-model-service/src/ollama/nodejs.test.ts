import '@ocap/test-utils/mock-endoify';

import { fetchMock } from '@ocap/test-utils';
import { expect, describe, it, beforeEach } from 'vitest';

import { OllamaNodejsLanguageModelService } from './nodejs.ts';
import type { OllamaNodejsConfig } from './types.ts';
import { mockReadableStream } from '../../test/utils.ts';

describe('OllamaNodejsLanguageModelService', () => {
  let service: OllamaNodejsLanguageModelService;
  const archetype = 'fast';
  const clientConfig = { host: 'http://127.0.0.1:11434' };
  const archetypes = { [archetype]: 'llama3.2:latest' };
  const endowments = { fetch: fetchMock };

  beforeEach(async () => {
    service = new OllamaNodejsLanguageModelService({
      archetypes,
      endowments,
      clientConfig,
    });
  });

  describe('constructor', () => {
    it.each([
      ['no clientConfig', { archetypes, endowments }],
      ['empty clientConfig', { archetypes, endowments, clientConfig: {} }],
      ['basic clientConfig', { archetypes, endowments, clientConfig }],
    ])(
      'should create a service with the correct endowments: %s',
      (_testName, config: OllamaNodejsConfig) => {
        const constructedService = new OllamaNodejsLanguageModelService(config);
        expect(constructedService).toBeDefined();
      },
    );

    it.each([
      ['no endowments', { archetypes }, 'Must endow a fetch implementation.'],
      [
        'no fetch',
        { archetypes, endowments: {} },
        'Must endow a fetch implementation.',
      ],
    ])(
      'should throw an error if misconfigured: %s',
      (_testName, config, expectedError) => {
        expect(
          () =>
            new OllamaNodejsLanguageModelService(
              // @ts-expect-error - Destructive test
              config,
            ),
        ).toThrow(expectedError);
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
