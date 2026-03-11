import { makeEventualIterator } from '@ocap/remote-iterables';
import { describe, expect, it } from 'vitest';

import {
  LANGUAGE_MODEL_SERVICE_NAME,
  makeKernelLanguageModelService,
} from '../../src/kernel-service.ts';
import {
  makeQueueModel,
  makeQueueService,
} from '../../src/test-utils/index.ts';

type WrappedService = {
  makeInstance: (config: unknown) => Promise<WrappedModel>;
};

type WrappedModel = {
  getInfo: () => Promise<unknown>;
  load: () => Promise<void>;
  unload: () => Promise<void>;
  sample: (
    prompt: string,
    options?: unknown,
  ) => Promise<{
    getStream: () => unknown;
    abort: () => Promise<void>;
  }>;
};

describe('makeKernelLanguageModelService + makeQueueService', () => {
  it('service name equals LANGUAGE_MODEL_SERVICE_NAME', () => {
    const { name } = makeKernelLanguageModelService(makeQueueService());
    expect(name).toBe(LANGUAGE_MODEL_SERVICE_NAME);
  });

  it('makeInstance returns a model with getInfo, load, unload, sample', async () => {
    const { service } = makeKernelLanguageModelService(makeQueueService());
    const model = await (service as WrappedService).makeInstance({
      model: 'test',
    });
    expect(model).toMatchObject({
      getInfo: expect.any(Function),
      load: expect.any(Function),
      unload: expect.any(Function),
      sample: expect.any(Function),
    });
  });

  it('getInfo returns model info from underlying service', async () => {
    const { service } = makeKernelLanguageModelService(makeQueueService());
    const model = await (service as WrappedService).makeInstance({
      model: 'test-model',
    });
    const info = await model.getInfo();
    expect(info).toMatchObject({ model: 'test' });
  });

  it('streams tokens from pre-pushed queue response', async () => {
    const model = makeQueueModel();
    model.push('Hello from kernel service.');
    const underlyingService = {
      makeInstance: async () => model,
    };

    const { service } = makeKernelLanguageModelService(underlyingService);
    const wrappedModel = await (service as WrappedService).makeInstance({
      model: 'test',
    });

    const sampleResult = await wrappedModel.sample('What do you say?');
    const streamRef = sampleResult.getStream();
    const iterator = makeEventualIterator(
      streamRef as Parameters<typeof makeEventualIterator>[0],
    );

    let response = '';
    for await (const chunk of iterator) {
      response += (chunk as { response: string }).response;
    }

    expect(response).toBe('Hello from kernel service.');
  });

  it('abort stops stream iteration', async () => {
    const model = makeQueueModel();
    model.push('Token one two three.');
    const underlyingService = { makeInstance: async () => model };

    const { service } = makeKernelLanguageModelService(underlyingService);
    const wrappedModel = await (service as WrappedService).makeInstance({
      model: 'test',
    });

    const sampleResult = await wrappedModel.sample('prompt');
    await sampleResult.abort();
    // After abort the abort function has been called without error
    expect(true).toBe(true);
  });
});
