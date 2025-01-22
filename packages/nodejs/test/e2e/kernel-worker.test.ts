import '@ocap/shims/endoify';

import type { NonEmptyArray } from '@metamask/utils';
import { Kernel, VatCommandMethod } from '@ocap/kernel';
import type { VatConfig, VatId } from '@ocap/kernel';
import {
  MessageChannel as NodeMessageChannel,
  MessagePort as NodePort,
  Worker as NodeWorker,
} from 'node:worker_threads';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { makeKernel } from '../../src/kernel/make-kernel.js';

const workerFileURL = new URL('../../dist/vat-worker.mjs', import.meta.url)
  .pathname;

vi.mock('node:process', () => ({
  exit: vi.fn((reason) => {
    throw new Error(`process.exit: ${reason}`);
  }),
}));

describe('Kernel Worker', () => {
  let kernelPort: NodePort;
  let kernel: Kernel;

  const testVatConfig: VatConfig = {
    bundleSpec: 'http://localhost:3000/sample-vat.bundle',
    parameters: { name: 'Nodeen' },
  };

  beforeEach(() => {
    if (kernelPort) {
      kernelPort.close();
    }
    kernelPort = new NodeMessageChannel().port1;
  });

  afterEach(async () => {
    if (kernel) {
      await kernel.terminateAllVats();
      await kernel.clearStorage();
    }
  });

  it('starts a NodeWorker', async () => {
    const worker = new NodeWorker(workerFileURL);
    expect(worker).toBeInstanceOf(NodeWorker);
  });

  it('makes a Kernel', async () => {
    kernel = await makeKernel(kernelPort);
    expect(kernel).toBeInstanceOf(Kernel);
  });

  it('creates a vat', async () => {
    kernel = await makeKernel(kernelPort);
    let vatIds: VatId[] = kernel.getVatIds();
    expect(vatIds).toHaveLength(0);

    const kRef = await kernel.launchVat(testVatConfig);
    expect(kRef).toBeInstanceOf(String);
    vatIds = kernel.getVatIds();
    expect(vatIds).toHaveLength(1);
  });

  it('should handle the lifecycle of multiple vats', async () => {
    console.log('Started test.');
    console.log('Creating kernel...');
    kernel = await makeKernel(kernelPort);
    console.log('Kernel created.');

    console.log('Handling the lifecycle of multiple vats...');
    await runVatLifecycle(kernel, ['v1', 'v2', 'v3']);
    console.log('Lifecycle of multiple vats handled.');

    console.log('Test passed.');
    expect(true).toBe(true);
  });
});

/**
 * Runs the full lifecycle of an array of vats, including their creation,
 * restart, message passing, and termination.
 *
 * @param kernel The kernel instance.
 * @param vats An array of VatIds to be managed.
 * @param vatConfig The config to pass for vat initialization.
 */
export async function runVatLifecycle(
  kernel: Kernel,
  vats: NonEmptyArray<VatId>,
  vatConfig: VatConfig = {
    bundleSpec: 'http://localhost:3000/sample-vat.bundle',
    parameters: { name: 'Nodeen' },
  },
): Promise<void> {
  console.log('runVatLifecycle Start...');
  const vatLabel = vats.join(', ');
  console.time(`Created vats: ${vatLabel}`);
  const kRef = await kernel.launchVat(vatConfig);
  console.debug('kref', kRef);

  await Promise.all(vats.map(async () => await kernel.launchVat(vatConfig)));
  console.timeEnd(`Created vats: ${vatLabel}`);
  const knownVats = kernel.getVatIds() as NonEmptyArray<VatId>;
  const knownVatsLabel = knownVats.join(', ');
  console.log('Kernel vats:', knownVatsLabel);

  // Restart a randomly selected vat from the array.
  console.time(`Restart vats: ${knownVatsLabel}`);
  await Promise.all(
    knownVats.map(async (vatId: VatId) => await kernel.restartVat(vatId)),
  );
  console.timeEnd(`Restart vats: ${knownVatsLabel}`);

  // Send a "Ping" message to a randomly selected vat.
  console.time(`Ping vats: ${knownVatsLabel}`);
  await Promise.all(
    knownVats.map(
      async (vatId: VatId) =>
        await kernel.sendMessage(vatId, {
          method: VatCommandMethod.ping,
          params: null,
        }),
    ),
  );
  console.timeEnd(`Ping vats "${knownVatsLabel}"`);

  console.time(`Terminated vats: ${knownVatsLabel}`);
  await kernel.terminateAllVats();
  console.timeEnd(`Terminated vats: ${knownVatsLabel}`);

  console.log(`Kernel has ${kernel.getVatIds().length} vats`);
}
