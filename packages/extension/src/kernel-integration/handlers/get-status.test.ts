import '@ocap/shims/endoify';
import type { Kernel, KVStore } from '@ocap/kernel';
import { describe, it, expect, vi } from 'vitest';

import { getStatusHandler } from './get-status.js';

describe('getStatusHandler', () => {
  const mockVats = [
    { id: 'v0', config: { sourceSpec: 'test.js' } },
    { id: 'v1', config: { sourceSpec: 'test2.js' } },
  ];

  const mockKernel = {
    getVats: vi.fn(() => mockVats),
  } as unknown as Kernel;

  const mockKVStore = {} as unknown as KVStore;

  it('should have the correct method', () => {
    expect(getStatusHandler.method).toBe('getStatus');
  });

  it('should have a schema', () => {
    expect(getStatusHandler.schema).toBeDefined();
  });

  it('should return vats status', async () => {
    const result = await getStatusHandler.implementation(
      mockKernel,
      mockKVStore,
      null,
    );
    expect(mockKernel.getVats).toHaveBeenCalledOnce();
    expect(result).toStrictEqual({ vats: mockVats });
  });
});
