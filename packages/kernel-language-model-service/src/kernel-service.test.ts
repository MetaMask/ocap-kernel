import { describe, it, expect, vi } from 'vitest';

import {
  LANGUAGE_MODEL_SERVICE_NAME,
  makeKernelLanguageModelService,
} from './kernel-service.ts';
import type { LanguageModelService } from './types.ts';

const makeService = (): LanguageModelService<unknown, unknown, unknown> => ({
  makeInstance: vi.fn(),
});

describe('LANGUAGE_MODEL_SERVICE_NAME', () => {
  it('equals languageModelService', () => {
    expect(LANGUAGE_MODEL_SERVICE_NAME).toBe('languageModelService');
  });
});

describe('makeKernelLanguageModelService', () => {
  it('returns object with correct name and a service', () => {
    const result = makeKernelLanguageModelService(makeService());
    expect(result).toMatchObject({
      name: LANGUAGE_MODEL_SERVICE_NAME,
      service: expect.any(Object),
    });
  });

  it('service has a makeInstance method', () => {
    const { service } = makeKernelLanguageModelService(makeService());
    expect(service).toMatchObject({ makeInstance: expect.any(Function) });
  });

  it('makeInstance delegates to underlying service and returns remotable model', async () => {
    const mockStream = (async function* () {
      yield 'chunk1';
      yield 'chunk2';
    })();
    const mockAbort = vi.fn().mockResolvedValue(undefined);
    const mockModel = {
      getInfo: vi.fn().mockResolvedValue({ model: 'test' }),
      load: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      sample: vi
        .fn()
        .mockResolvedValue({ stream: mockStream, abort: mockAbort }),
    };
    const mockService = {
      makeInstance: vi.fn().mockResolvedValue(mockModel),
    };

    const { service } = makeKernelLanguageModelService(mockService);
    const config = { model: 'test-model' };
    const model = await (
      service as { makeInstance: (c: unknown) => Promise<unknown> }
    ).makeInstance(config);

    expect(mockService.makeInstance).toHaveBeenCalledWith(config);
    expect(model).toMatchObject({
      getInfo: expect.any(Function),
      load: expect.any(Function),
      unload: expect.any(Function),
      sample: expect.any(Function),
    });
  });

  it('model methods delegate to underlying model', async () => {
    const mockModel = {
      getInfo: vi.fn().mockResolvedValue({ model: 'my-model' }),
      load: vi.fn().mockResolvedValue(undefined),
      unload: vi.fn().mockResolvedValue(undefined),
      sample: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield* [];
        })(),
        abort: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const mockService = { makeInstance: vi.fn().mockResolvedValue(mockModel) };
    const { service } = makeKernelLanguageModelService(mockService);
    const model = await (
      service as {
        makeInstance: (c: unknown) => Promise<{
          getInfo: () => Promise<unknown>;
          load: () => Promise<void>;
          unload: () => Promise<void>;
          sample: (p: string) => Promise<unknown>;
        }>;
      }
    ).makeInstance({ model: 'my-model' });

    expect(await model.getInfo()).toStrictEqual({ model: 'my-model' });
    await model.load();
    await model.unload();

    expect(mockModel.getInfo).toHaveBeenCalled();
    expect(mockModel.load).toHaveBeenCalled();
    expect(mockModel.unload).toHaveBeenCalled();
  });

  it('sample returns object with getStream and abort methods', async () => {
    const mockAbort = vi.fn().mockResolvedValue(undefined);
    const mockModel = {
      getInfo: vi.fn(),
      load: vi.fn(),
      unload: vi.fn(),
      sample: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield 'token';
        })(),
        abort: mockAbort,
      }),
    };
    const mockService = { makeInstance: vi.fn().mockResolvedValue(mockModel) };
    const { service } = makeKernelLanguageModelService(mockService);
    const model = await (
      service as {
        makeInstance: (c: unknown) => Promise<{
          sample: (p: string) => Promise<{
            getStream: () => unknown;
            abort: () => Promise<void>;
          }>;
        }>;
      }
    ).makeInstance({ model: 'test' });

    const sampleResult = await model.sample('hello');

    expect(sampleResult).toMatchObject({
      getStream: expect.any(Function),
      abort: expect.any(Function),
    });
    expect(mockModel.sample).toHaveBeenCalledWith('hello', undefined);
  });

  it('abort delegates to underlying abort function', async () => {
    const mockAbort = vi.fn().mockResolvedValue(undefined);
    const mockModel = {
      getInfo: vi.fn(),
      load: vi.fn(),
      unload: vi.fn(),
      sample: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield* [];
        })(),
        abort: mockAbort,
      }),
    };
    const mockService = { makeInstance: vi.fn().mockResolvedValue(mockModel) };
    const { service } = makeKernelLanguageModelService(mockService);
    const model = await (
      service as {
        makeInstance: (c: unknown) => Promise<{
          sample: (p: string) => Promise<{
            getStream: () => unknown;
            abort: () => Promise<void>;
          }>;
        }>;
      }
    ).makeInstance({ model: 'test' });

    const sampleResult = await model.sample('hello');
    await sampleResult.abort();

    expect(mockAbort).toHaveBeenCalled();
  });
});
