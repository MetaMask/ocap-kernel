import '@ocap/shims/endoify';
import type { NonEmptyArray } from '@metamask/utils';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { Kernel, VatCommandMethod } from '@ocap/kernel';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { MessagePort as NodeMessagePort } from 'worker_threads';

import { makeSQLKVStore } from './sqlite-kv-store.js';
import { NodejsVatWorkerService } from './VatWorkerService.js';

/**
 * The main function for the kernel worker.
 *
 * @param port - The kernel's end of a node:worker_threads MessageChannel
 * @returns The kernel, initialized.
 */
export async function makeKernel(port: NodeMessagePort): Promise<Kernel> {
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(port);
  const vatWorkerClient = new NodejsVatWorkerService();

  // Initialize kernel store.
  const kvStore = await makeSQLKVStore();

  // Create and start kernel.
  const kernel = new Kernel(nodeStream, vatWorkerClient, kvStore);
  await kernel.init();

  return kernel;
}

/**
 * Runs the full lifecycle of an array of vats, including their creation,
 * restart, message passing, and termination.
 *
 * @param kernel The kernel instance.
 * @param vats An array of VatIds to be managed.
 */
export async function runVatLifecycle(
  kernel: Kernel,
  vats: NonEmptyArray<VatId>,
): Promise<void> {
  console.log('runVatLifecycle Start...');
  const vatLabel = vats.join(', ');
  console.time(`Created vats: ${vatLabel}`);
  await Promise.all(
    vats.map(
      async () =>
        await kernel.launchVat({
          bundleSpec: 'http://localhost:3000/sample-vat.bundle',
          parameters: { name: 'Nodeen' },
        }),
    ),
  );
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
