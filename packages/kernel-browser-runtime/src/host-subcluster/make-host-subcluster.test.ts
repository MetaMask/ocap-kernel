import type { Kernel, SystemSubclusterConfig } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeHostSubcluster } from './make-host-subcluster.ts';
import type { HostSubclusterConfig } from './types.ts';

describe('makeHostSubcluster', () => {
  let kernel: Kernel;
  const buildRootObject = vi.fn(() => ({ test: () => 'test' }));

  beforeEach(() => {
    vi.clearAllMocks();

    kernel = {
      launchSystemSubcluster: vi.fn().mockResolvedValue({
        systemSubclusterId: 'ss0',
        vatIds: { testVat: 'sv0' },
      }),
    } as unknown as Kernel;
  });

  it('calls kernel.launchSystemSubcluster with converted config', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    };

    await makeHostSubcluster({ kernel, config });

    expect(kernel.launchSystemSubcluster).toHaveBeenCalledWith({
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    });
  });

  it('returns systemSubclusterId and vatIds', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    };

    const result = await makeHostSubcluster({ kernel, config });

    expect(result.systemSubclusterId).toBe('ss0');
    expect(result.vatIds).toStrictEqual({ testVat: 'sv0' });
  });

  it('converts multiple vats', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'bootstrap',
      vats: {
        bootstrap: { buildRootObject },
        worker: { buildRootObject },
      },
    };

    await makeHostSubcluster({ kernel, config });

    const calledConfig = (
      kernel.launchSystemSubcluster as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as SystemSubclusterConfig;
    expect(calledConfig.vats.bootstrap).toBeDefined();
    expect(calledConfig.vats.worker).toBeDefined();
  });

  it('includes parameters when provided', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: {
          buildRootObject,
          parameters: { key: 'value' },
        },
      },
    };

    await makeHostSubcluster({ kernel, config });

    const calledConfig = (
      kernel.launchSystemSubcluster as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as SystemSubclusterConfig;
    expect(calledConfig.vats.testVat?.parameters).toStrictEqual({
      key: 'value',
    });
  });

  it('omits parameters when undefined', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    };

    await makeHostSubcluster({ kernel, config });

    const calledConfig = (
      kernel.launchSystemSubcluster as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as SystemSubclusterConfig;
    expect(
      Object.prototype.hasOwnProperty.call(
        calledConfig.vats.testVat,
        'parameters',
      ),
    ).toBe(false);
  });

  it('includes services when provided', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
      services: ['platformService'],
    };

    await makeHostSubcluster({ kernel, config });

    const calledConfig = (
      kernel.launchSystemSubcluster as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as SystemSubclusterConfig;
    expect(calledConfig.services).toStrictEqual(['platformService']);
  });

  it('omits services when undefined', async () => {
    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    };

    await makeHostSubcluster({ kernel, config });

    const calledConfig = (
      kernel.launchSystemSubcluster as ReturnType<typeof vi.fn>
    ).mock.calls[0][0] as SystemSubclusterConfig;
    expect(Object.prototype.hasOwnProperty.call(calledConfig, 'services')).toBe(
      false,
    );
  });

  it('propagates errors from kernel.launchSystemSubcluster', async () => {
    const error = new Error('Launch failed');
    (
      kernel.launchSystemSubcluster as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(error);

    const config: HostSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: { buildRootObject },
      },
    };

    await expect(makeHostSubcluster({ kernel, config })).rejects.toThrow(
      'Launch failed',
    );
  });
});
