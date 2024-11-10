import './env.js';
import type { NonEmptyArray } from '@metamask/utils';
import type { VatId } from '@ocap/kernel';
import { Kernel, VatCommandMethod } from '@ocap/kernel';

import { makeSQLKVStore } from './sqlite-kv-store.js';
import { NodejsVatWorkerService } from './VatWorkerService.js';


/**
 * The main function for the kernel worker.
 */
export async function makeKernel(): Promise<Kernel> {
  const vatWorkerClient = new NodejsVatWorkerService();

  // Initialize kernel store.
  const kvStore = await makeSQLKVStore();

  // Create and start kernel.
  const kernel = new Kernel(null, vatWorkerClient, kvStore);
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
  console.time(`Created vats: ${vats.join(', ')}`);
  await Promise.all(vats.map(async (id) => kernel.launchVat({ id })));
  console.timeEnd(`Created vats: ${vats.join(', ')}`);

  console.log('Kernel vats:', kernel.getVatIds().join(', '));

  // Restart a randomly selected vat from the array.
  const vatToRestart = vats[Math.floor(Math.random() * vats.length)] as VatId;
  console.time(`Vat "${vatToRestart}" restart`);
  await kernel.restartVat(vatToRestart);
  console.timeEnd(`Vat "${vatToRestart}" restart`);

  // Send a "Ping" message to a randomly selected vat.
  const vatToPing = vats[Math.floor(Math.random() * vats.length)] as VatId;
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
