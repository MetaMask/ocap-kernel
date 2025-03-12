import '@ocap/shims/endoify';

import { Kernel, VatCommandMethod } from '@ocap/kernel';
import type { VatConfig, VatId } from '@ocap/kernel';
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

  const testVatConfig: VatConfig = {
    bundleSpec: 'http://localhost:3000/sample-vat.bundle',
    parameters: { name: 'Nodeen' },
  };

  beforeEach(async () => {
    if (kernelPort) {
      kernelPort.close();
    }
    kernelPort = new NodeMessageChannel().port1;
    kernel = await makeKernel(kernelPort);
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.terminateAllVats();
      await kernel.clearStorage();
    }
  });

  it('launches a vat', async () => {
    expect(kernel.getVatIds()).toHaveLength(0);
    const kRef = await kernel.launchVat(testVatConfig);
    expect(typeof kRef).toBe('string');
    expect(kernel.getVatIds()).toHaveLength(1);
  });

  const launchTestVats = async (): Promise<void> => {
    await Promise.all(
      testVatIds.map(async () => await kernel.launchVat(testVatConfig)),
    );
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
    await Promise.all(
      testVatIds.map(
        async (vatId: VatId) =>
          await kernel.sendVatCommand(vatId, {
            method: VatCommandMethod.ping,
            params: null,
          }),
      ),
    );
    expect(true).toBe(true);
  });
});
