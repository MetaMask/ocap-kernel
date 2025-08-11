import type { GenerateResponse, ListResponse } from 'ollama';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { OllamaClient, OllamaModelOptions } from './types.ts';
import type { InstanceConfig, LanguageModel } from '../types.ts';
import { OllamaBaseLanguageModelService } from './base.ts';
import { makeMockAbortableAsyncIterator } from '../../test/utils.ts';

describe('OllamaBaseLanguageModelService', () => {
  let mockClient: OllamaClient;
  let mockMakeClient: () => Promise<OllamaClient>;
  let service: OllamaBaseLanguageModelService<OllamaClient>;

  const archetypes = {
    default: 'llama2:7b',
    fast: 'llama2:3b',
    accurate: 'llama2:13b',
  } as const;

  beforeEach(() => {
    mockClient = {
      list: vi.fn(),
      generate: vi.fn(),
    };

    mockMakeClient = vi.fn().mockResolvedValue(mockClient);
    service = new OllamaBaseLanguageModelService(archetypes, mockMakeClient);
  });

  describe('constructor', () => {
    it('should initialize with archetypes and makeClient function', () => {
      expect(service).toBeInstanceOf(OllamaBaseLanguageModelService);
    });

    it('should handle empty archetypes', () => {
      const emptyArchetypes = {};
      const serviceWithEmptyArchetypes = new OllamaBaseLanguageModelService(
        emptyArchetypes,
        mockMakeClient,
      );
      expect(serviceWithEmptyArchetypes).toBeInstanceOf(
        OllamaBaseLanguageModelService,
      );
    });
  });

  describe('getModels', () => {
    it('should return models from client', async () => {
      const mockListResponse = {
        models: [
          {
            name: 'llama2:7b',
          },
          {
            name: 'llama2:13b',
          },
        ],
      } as ListResponse;

      vi.mocked(mockClient.list).mockResolvedValue(mockListResponse);

      const result = await service.getModels();

      expect(mockMakeClient).toHaveBeenCalledOnce();
      expect(mockClient.list).toHaveBeenCalledOnce();
      expect(result).toStrictEqual(mockListResponse);
    });

    it('should handle client creation errors', async () => {
      const error = new Error('Failed to create client');
      mockMakeClient = vi.fn().mockRejectedValue(error);
      service = new OllamaBaseLanguageModelService(archetypes, mockMakeClient);

      await expect(service.getModels()).rejects.toThrow(
        'Failed to create client',
      );
    });

    it('should handle list errors', async () => {
      const error = new Error('Failed to list models');
      vi.mocked(mockClient.list).mockRejectedValue(error);

      await expect(service.getModels()).rejects.toThrow(
        'Failed to list models',
      );
    });
  });

  describe('makeInstance', () => {
    it('should create instance with archetype model', async () => {
      const config: InstanceConfig<OllamaModelOptions> = {
        archetype: 'default',
        options: { temperature: 0.7 },
      };

      const instance = await service.makeInstance(config);

      expect(mockMakeClient).toHaveBeenCalledOnce();
      expect(await instance.getInfo()).toMatchObject({ model: 'llama2:7b' });
      expect(instance).toHaveProperty('load');
      expect(instance).toHaveProperty('unload');
      expect(instance).toHaveProperty('sample');
    });

    it('should create instance with direct model name', async () => {
      const config: InstanceConfig<OllamaModelOptions> = {
        model: 'custom-model:latest',
        options: { temperature: 0.8 },
      };

      const instance = await service.makeInstance(config);

      expect(await instance.getInfo()).toMatchObject({
        model: 'custom-model:latest',
      });
    });

    it('should throw error for unknown archetype', async () => {
      const config: InstanceConfig<OllamaModelOptions> = {
        archetype: 'unknown',
      };

      await expect(service.makeInstance(config)).rejects.toThrow(
        /^Archetype .+ not found$/u,
      );
    });

    it('should handle config with no options', async () => {
      const config: InstanceConfig<OllamaModelOptions> = {
        archetype: 'default',
      };

      const instance = await service.makeInstance(config);

      expect(await instance.getInfo()).toMatchObject({ model: 'llama2:7b' });
    });
  });

  describe('instance methods', () => {
    let instance: LanguageModel<OllamaModelOptions, GenerateResponse>;

    beforeEach(async () => {
      const config: InstanceConfig<OllamaModelOptions> = {
        archetype: 'default',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        options: { temperature: 0.7, top_p: 0.9 },
      };
      instance = await service.makeInstance(config);
    });

    describe('load', () => {
      it('should call generate with keep_alive: -1', async () => {
        await instance.load();

        expect(mockClient.generate).toHaveBeenCalledWith({
          model: 'llama2:7b',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          keep_alive: -1,
        });
      });

      it('should handle load errors', async () => {
        const error = new Error('Load failed');
        vi.mocked(mockClient.generate).mockRejectedValue(error);

        await expect(instance.load()).rejects.toThrow('Load failed');
      });
    });

    describe('unload', () => {
      it('should call generate with keep_alive: 0', async () => {
        await instance.unload();

        expect(mockClient.generate).toHaveBeenCalledWith({
          model: 'llama2:7b',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          keep_alive: 0,
        });
      });

      it('should handle unload errors', async () => {
        const error = new Error('Unload failed');
        vi.mocked(mockClient.generate).mockRejectedValue(error);

        await expect(instance.unload()).rejects.toThrow('Unload failed');
      });
    });

    describe('sample', () => {
      const mockResponse = {
        thinking: 'Thinking...',
        response: 'Hello world',
        done: false,
      } as GenerateResponse;

      it('should call generate with correct parameters and merge options', async () => {
        const prompt = 'Hello, how are you?';
        const options = { temperature: 0.5 };

        vi.mocked(mockClient.generate).mockResolvedValue(
          makeMockAbortableAsyncIterator([mockResponse]),
        );

        const result = await instance.sample(prompt, options);

        for await (const chunk of result) {
          expect(chunk).toMatchObject(mockResponse);
        }

        expect(mockClient.generate).toHaveBeenCalledWith({
          temperature: 0.5, // from options (should override config)
          // eslint-disable-next-line @typescript-eslint/naming-convention
          top_p: 0.9, // from config
          model: 'llama2:7b',
          stream: true,
          raw: true,
          prompt,
        });
      });

      it('should use default options when none provided', async () => {
        const prompt = 'Hello, how are you?';

        await instance.sample(prompt);

        expect(mockClient.generate).toHaveBeenCalledWith({
          temperature: 0.7,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          top_p: 0.9,
          model: 'llama2:7b',
          stream: true,
          raw: true,
          prompt,
        });
      });

      it('should handle generate errors', async () => {
        const error = new Error('Generate failed');
        vi.mocked(mockClient.generate).mockRejectedValue(error);

        const prompt = 'Hello, how are you?';

        await expect(instance.sample(prompt)).rejects.toThrow(
          'Generate failed',
        );
      });
    });
  });
});
