import type { NonEmptyArray } from '@metamask/utils';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { Kernel, VatCommandMethod } from '@ocap/kernel';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';
import { makeLogger, stringify } from '@ocap/utils';

import { isKernelControlCommand } from './messages.js';
import type { KernelControlCommand, KernelControlReply } from './messages.js';
import { makeSQLKVStore } from './sqlite-kv-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

const logger = makeLogger('[kernel worker]');

main().catch((error) => logger.error('Kernel worker error:', error));

/**
 *
 */
async function main(): Promise<void> {
  const kernelStream = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  ).then(async (port) =>
    MessagePortDuplexStream.make<KernelCommand, KernelCommandReply>(port),
  );

  // Initialize kernel dependencies
  const vatWorkerClient = new ExtensionVatWorkerClient(
    (message) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
  );
  const kvStore = await makeSQLKVStore();

  // Create and initialize kernel
  const kernel = new Kernel(kernelStream, vatWorkerClient, kvStore);
  await kernel.init();

  // Run default kernel lifecycle
  await runVatLifecycle(kernel, ['v1', 'v2', 'v3']);
  await kernel.launchVat({ id: 'v0' });

  // Handle Kernel Panel messages
  // TODO: This is a temporary solution to allow the kernel worker to send replies back to the
  // offscreen script. This should be replaced with MultiplexStream once it's implemented.
  globalThis.addEventListener('message', (event) => {
    if (isKernelControlCommand(event.data)) {
      handleControlMessage(kernel, event.data)
        .then((reply) => globalThis.postMessage(reply))
        .catch(logger.error);
    }
  });
}

/**
 * Runs the full lifecycle of an array of vats
 *
 * @param kernel - The kernel instance.
 * @param vats - The vats to run the lifecycle for.
 */
async function runVatLifecycle(
  kernel: Kernel,
  vats: NonEmptyArray<VatId>,
): Promise<void> {
  console.time(`Created vats: ${vats.join(', ')}`);
  await Promise.all(vats.map(async (id) => kernel.launchVat({ id })));
  console.timeEnd(`Created vats: ${vats.join(', ')}`);

  logger.log('Kernel vats:', kernel.getVatIds().join(', '));

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

  logger.log(`Kernel has ${kernel.getVatIds().length} vats`);
}

/**
 * Handle a control message and return the appropriate reply.
 *
 * @param kernel - The kernel instance.
 * @param message - The control message to handle.
 * @returns The reply to the control message.
 */
async function handleControlMessage(
  kernel: Kernel,
  message: KernelControlCommand,
): Promise<KernelControlReply> {
  switch (message.method) {
    case 'launchVat':
      await kernel.launchVat({ id: message.params.id });
      return { method: 'launchVat', params: null };

    case 'restartVat':
      await kernel.restartVat(message.params.id);
      return { method: 'restartVat', params: null };

    case 'terminateVat':
      await kernel.terminateVat(message.params.id);
      return { method: 'terminateVat', params: null };

    case 'terminateAllVats':
      await kernel.terminateAllVats();
      return { method: 'terminateAllVats', params: null };

    case 'getStatus':
      return {
        method: 'getStatus',
        params: {
          isRunning: true, // TODO: Track actual kernel state
          activeVats: kernel.getVatIds(),
        },
      };

    default:
      logger.error('Unknown control message method', message);
      throw new Error(`Unknown control message: ${stringify(message)}`);
  }
}
