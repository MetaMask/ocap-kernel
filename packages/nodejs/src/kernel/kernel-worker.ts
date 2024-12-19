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

const sampleOne = <Ele>(from: Ele[]): Ele =>
  from[Math.floor(Math.random() * from.length)];

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
  console.log('Kernel vats:', kernel.getVatIds().join(', '));

  const knownVats = kernel.getVatIds();

  // Restart a randomly selected vat from the array.
  const vatToRestart = sampleOne(knownVats);
  console.time(`Vat "${vatToRestart}" restart`);
  await kernel.restartVat(vatToRestart);
  console.timeEnd(`Vat "${vatToRestart}" restart`);

  // Send a "Ping" message to a randomly selected vat.
  const vatToPing = sampleOne(knownVats);
  console.time(`Ping Vat "${vatToPing}"`);
  await kernel.sendMessage(vatToPing, {
    method: VatCommandMethod.ping,
    params: null,
  });
  console.timeEnd(`Ping Vat "${vatToPing}"`);

  const vatIds = kernel.getVatIds().join(', ');
  console.time(`Terminated vats: ${vatIds}`);
  await kernel.terminateAllVats();
  console.timeEnd(`Terminated vats: ${vatIds}`);

  console.log(`Kernel has ${kernel.getVatIds().length} vats`);
}
