import type { ClusterConfig } from '@metamask/ocap-kernel';
import { describe, it, expect, vi } from 'vitest';

import { updateClusterConfigHandler } from './update-cluster-config.ts';

describe('updateClusterConfigHandler', () => {
  const makeTestConfig = (): ClusterConfig => ({
    bootstrap: 'testVat',
    forceReset: true,
    vats: {
      testVat: {
        sourceSpec: 'test-source',
      },
    },
  });

  it('should update kernel cluster config', () => {
    const updateClusterConfig = vi.fn();
    const testConfig = makeTestConfig();
    const result = updateClusterConfigHandler.implementation(
      { updateClusterConfig },
      { config: testConfig },
    );

    expect(updateClusterConfig).toHaveBeenCalledWith(testConfig);
    expect(result).toBeNull();
  });

  it('should propagate errors from updateClusterConfig', () => {
    const error = new Error('Update failed');
    const updateClusterConfig = vi.fn(() => {
      throw error;
    });
    expect(() =>
      updateClusterConfigHandler.implementation(
        { updateClusterConfig },
        { config: makeTestConfig() },
      ),
    ).toThrow(error);
  });
});
