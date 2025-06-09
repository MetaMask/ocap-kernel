import '@metamask/kernel-shims/endoify';

import { Kernel } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import {
  MessageChannel as NodeMessageChannel,
  MessagePort as NodePort,
} from 'node:worker_threads';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeKernel } from '../../src/kernel/make-kernel.ts';

vi.mock('node:process', () => ({
  exit: vi.fn((reason) => {
    throw new Error(`process.exit: ${reason}`);
  }),
}));

describe('Kernel Worker', () => {
  let kernelPort: NodePort;
  let kernel: Kernel;

  // Tests below assume these are sorted for convenience.
  const testVatIds = ['v1', 'v2', 'v3'].sort();

  beforeEach(async () => {
    if (kernelPort) {
      kernelPort.close();
    }
    kernelPort = new NodeMessageChannel().port1;
    kernel = await makeKernel({
      port: kernelPort,
    });
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.terminateAllVats();
      await kernel.clearStorage();
    }
  });

  it('launches a subcluster', async () => {
    expect(kernel.getVatIds()).toHaveLength(0);
    const testConfig: ClusterConfig = {
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: 'http://localhost:3000/sample-vat.bundle',
          parameters: { name: 'Nodeen' },
        },
      },
    };
    await kernel.launchSubcluster(testConfig);
    expect(kernel.getVatIds()).toHaveLength(1);
  });

  const launchTestVats = async (): Promise<void> => {
    const testConfig: ClusterConfig = {
      bootstrap: 'main',
      vats: {
        main: {
          bundleSpec: 'http://localhost:3000/sample-vat.bundle',
          parameters: { name: 'Nodeen' },
        },
        bob: {
          bundleSpec: 'http://localhost:3000/sample-vat.bundle',
          parameters: { name: 'Nodeen' },
        },
        alice: {
          bundleSpec: 'http://localhost:3000/sample-vat.bundle',
          parameters: { name: 'Nodeen' },
        },
      },
    };
    await kernel.launchSubcluster(testConfig);
    expect(kernel.getVatIds().sort()).toStrictEqual(testVatIds);
  };

  it('restarts vats', async () => {
    await launchTestVats();
    await Promise.all(testVatIds.map(kernel.restartVat.bind(kernel)));
    expect(kernel.getVatIds().sort()).toStrictEqual(testVatIds);
  }, 5000);

  it('terminates all vats', async () => {
    await launchTestVats();
    await kernel.terminateAllVats();
    expect(kernel.getVatIds()).toHaveLength(0);
  });

  it('pings vats', async () => {
    await launchTestVats();
    const result = await kernel.pingVat('v1');
    expect(result).toBeDefined();
    expect(result).toBe('pong');
  });
});
