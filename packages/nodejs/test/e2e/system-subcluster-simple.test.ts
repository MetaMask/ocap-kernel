import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type {
  Kernel,
  ClusterConfig,
  SystemSubclusterConfig,
} from '@metamask/ocap-kernel';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { makeKernel } from '../../src/kernel/make-kernel.ts';

describe('system subcluster simple tests', { timeout: 60_000 }, () => {
  let kernel: Kernel;

  beforeEach(async () => {
    kernel = await makeKernel({});
  });

  afterEach(async () => {
    await kernel.clearStorage();
  });

  // First test: verify regular dynamic subcluster works
  it('launches a regular dynamic subcluster', async () => {
    const config: ClusterConfig = {
      bootstrap: 'bob',
      vats: {
        bob: {
          bundleSpec: 'http://localhost:3000/bob-vat.bundle',
        },
      },
    };

    const result = await kernel.launchSubcluster(config);
    expect(result.subclusterId).toBeDefined();
    expect(result.bootstrapRootKref).toBeDefined();
  });

  // Second test: verify we can get kernel status
  it('gets kernel status', async () => {
    const status = await kernel.getStatus();
    expect(status).toBeDefined();
    expect(status.subclusters).toBeDefined();
  });

  // Third test: launch a system subcluster
  it('launches a system subcluster', async () => {
    const config: SystemSubclusterConfig = {
      bootstrap: 'testVat',
      vats: {
        testVat: {
          buildRootObject: (_vatPowers, _params) => {
            return makeDefaultExo('testRoot', {
              bootstrap: () => undefined,
              ping: () => 'pong',
            });
          },
        },
      },
    };

    const result = await kernel.launchSystemSubcluster(config);
    expect(result.systemSubclusterId).toBeDefined();
    expect(result.vatIds.testVat).toBe('sv0');
  });
});
