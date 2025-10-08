import '@ocap/repo-tools/test-utils/mock-endoify';

import { fetchMock } from '@ocap/repo-tools/test-utils';
import { expect, describe, it, beforeEach } from 'vitest';

import { OllamaNodejsService } from './nodejs.ts';
import type { OllamaNodejsConfig } from './types.ts';
import { mockReadableStream } from '../../test/utils.ts';

describe('OllamaNodejsService', () => {
  let service: OllamaNodejsService;
  const model = 'llama3.2:latest';
  const clientConfig = { host: 'http://127.0.0.1:11434' };
  const endowments = { fetch: fetchMock };

  beforeEach(async () => {
    service = new OllamaNodejsService({
      endowments,
      clientConfig,
    });
  });

  describe('constructor', () => {
    it.each([
      ['no clientConfig', { endowments }],
      ['empty clientConfig', { endowments, clientConfig: {} }],
      ['basic clientConfig', { endowments, clientConfig }],
    ])(
      'should create a service with the correct endowments: %s',
      (_testName, config: OllamaNodejsConfig) => {
        const constructedService = new OllamaNodejsService(config);
        expect(constructedService).toBeDefined();
      },
    );

    it.each([
      ['no endowments', {}, 'Must endow a fetch implementation.'],
      ['no fetch', { endowments: {} }, 'Must endow a fetch implementation.'],
    ])(
      'should throw an error if misconfigured: %s',
      (_testName, config, expectedError) => {
        expect(
          () =>
            new OllamaNodejsService(
              // @ts-expect-error - Destructive test
              config,
            ),
        ).toThrow(expectedError);
      },
    );
  });

  describe('makeInstance', () => {
    it('should create a model instance', async () => {
      const instance = await service.makeInstance({ model });
      expect(instance).toBeDefined();
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

      const instance = await service.makeInstance({ model });
      const { stream, abort } = await instance.sample('Hello, ');
      try {
        for await (const chunk of stream) {
          expect(chunk).toMatchObject({
            response,
            done: true,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            done_reason: 'stop',
          });
        }
      } finally {
        await abort();
      }
    });
  });
});
