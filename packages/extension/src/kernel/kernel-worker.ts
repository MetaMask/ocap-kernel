import type { NonEmptyArray } from '@metamask/utils';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { Kernel, VatCommandMethod } from '@ocap/kernel';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';

import { makeSQLKVStore } from './sqlite-kv-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

main().catch(console.error);

/**
 * The main function for the kernel worker.
 */
async function main(): Promise<void> {
  const kernelStream = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  ).then(async (port) =>
    MessagePortDuplexStream.make<KernelCommand, KernelCommandReply>(port),
  );

  const vatWorkerClient = new ExtensionVatWorkerClient(
    (message) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
  );

  // Initialize kernel store.
  const kvStore = await makeSQLKVStore();

  // Create and start kernel.
  const kernel = new Kernel(kernelStream, vatWorkerClient, kvStore);
  await kernel.init();

  // Handle the lifecycle of multiple vats.
  await runVatLifecycle(kernel, ['v1', 'v2', 'v3']);

  // Add default vat.
  await kernel.launchVat({ id: 'v0' });
}

/**
 * Runs the full lifecycle of an array of vats, including their creation,
 * restart, message passing, and termination.
 *
 * @param kernel The kernel instance.
 * @param vats An array of VatIds to be managed.
 */
async function runVatLifecycle(
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
    method: VatCommandMethod.Ping,
    params: null,
  });
  console.timeEnd(`Ping Vat "${vatToPing}"`);

  const vatIds = kernel.getVatIds().join(', ');
  console.time(`Terminated vats: ${vatIds}`);
  await kernel.terminateAllVats();
  console.timeEnd(`Terminated vats: ${vatIds}`);

  console.log(`Kernel has ${kernel.getVatIds().length} vats`);
}
