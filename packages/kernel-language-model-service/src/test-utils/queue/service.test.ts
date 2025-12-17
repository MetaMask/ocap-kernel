import '@ocap/repo-tools/test-utils/mock-endoify';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { QueueLanguageModel } from './model.ts';
import * as model from './model.ts';
import { makeQueueService } from './service.ts';

vi.mock('./model.ts', () => ({
  makeQueueModel: vi.fn(),
}));

describe('makeQueueService', () => {
  let mockMakeQueueModel: ReturnType<typeof vi.fn>;
  let mockModel: QueueLanguageModel<{ response: string; done: boolean }>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockModel = {
      getInfo: vi.fn(),
      load: vi.fn(),
      unload: vi.fn(),
      sample: vi.fn(),
      push: vi.fn(),
    } as unknown as QueueLanguageModel<{ response: string; done: boolean }>;

    mockMakeQueueModel = vi.mocked(model.makeQueueModel);
    mockMakeQueueModel.mockReturnValue(mockModel);
  });

  it('creates service with makeInstance method', () => {
    const service = makeQueueService();
    expect(service).toMatchObject({
      makeInstance: expect.any(Function),
    });
  });

  it('makeInstance calls makeQueueModel with options', async () => {
    const service = makeQueueService();
    const config = {
      model: 'test',
      options: {
        tokenizer: vi.fn(),
      },
    };

    const result = await service.makeInstance(config);

    expect(mockMakeQueueModel).toHaveBeenCalledWith(config.options);
    expect(result).toBe(mockModel);
  });

  it('makeInstance calls makeQueueModel with undefined options', async () => {
    const service = makeQueueService();
    const config = {
      model: 'test',
    };

    await service.makeInstance(config);

    expect(mockMakeQueueModel).toHaveBeenCalledWith(undefined);
  });
});
