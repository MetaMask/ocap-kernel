import type { Kernel } from '@ocap/kernel';
import type { KVStore } from '@ocap/store';
import { describe, it, expect } from 'vitest';

import { updateClusterConfigHandler } from './update-cluster-config.ts';

describe('updateClusterConfigHandler', () => {
  const mockKernel = {
    clusterConfig: null,
  } as Partial<Kernel>;

  const mockKvStore = {} as KVStore;

  const testConfig = {
    bootstrap: 'testVat',
    vats: {
      testVat: {
        sourceSpec: 'test-source',
      },
    },
  };

  it('should update kernel cluster config', async () => {
    const result = await updateClusterConfigHandler.implementation(
      mockKernel as Kernel,
      mockKvStore,
      { config: testConfig },
    );

    expect(mockKernel.clusterConfig).toStrictEqual(testConfig);
    expect(result).toBeNull();
  });

  it('should use the correct method name', () => {
    expect(updateClusterConfigHandler.method).toBe('updateClusterConfig');
  });

  it('should validate the config using the correct schema', () => {
    expect(updateClusterConfigHandler.schema).toBeDefined();
  });
});
