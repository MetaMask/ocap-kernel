import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';
import { describe, it, expect, vi } from 'vitest';

import { loggingMiddleware, logger } from './logging.js';

describe('loggingMiddleware', () => {
  const mockKVStore = {} as unknown as KVStore;
  const mockKernel = {} as unknown as Kernel;

  it('should call the next function with the provided arguments', async () => {
    const next = vi.fn();
    const middleware = loggingMiddleware(next);
    const params = { arg1: 'arg1', arg2: 'arg2' };
    await middleware(mockKernel, mockKVStore, params);
    expect(next).toHaveBeenCalledWith(mockKernel, mockKVStore, params);
  });

  it('should return the result from the next function', async () => {
    const expectedResult = 'test result';
    const next = vi.fn().mockResolvedValue(expectedResult);
    const middleware = loggingMiddleware(next);
    const result = await middleware(mockKernel, mockKVStore, {});
    expect(result).toBe(expectedResult);
  });

  it('should log the execution duration', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    const next = vi.fn().mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
    );
    const middleware = loggingMiddleware(next);
    await middleware(mockKernel, mockKVStore, {});
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Command executed in \d*\.?\d+ms/u),
    );
  });

  it('should log duration even if next function throws', async () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    const error = new Error('Test error');
    const next = vi.fn().mockRejectedValue(error);
    const middleware = loggingMiddleware(next);
    await expect(middleware(mockKernel, mockKVStore, {})).rejects.toThrow(
      error,
    );
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Command executed in \d*\.?\d+ms/u),
    );
  });
});
