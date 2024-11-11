import type { NonEmptyArray } from '@metamask/utils';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { Kernel, VatCommandMethod } from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MultiplexEnvelope } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { handlePanelMessage } from './handle-panel-message.js';
import type { KernelControlCommand, KernelControlReply } from './messages.js';
import { makeSQLKVStore } from './sqlite-kv-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

const logger = makeLogger('[kernel worker]');

main().catch(logger.error);

/**
 *
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort(
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  const baseStream = await MessagePortDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(port);
  const multiplexer = new StreamMultiplexer(
    baseStream,
    'KernelWorkerMultiplexer',
  );

  // Initialize kernel dependencies
  const vatWorkerClient = new ExtensionVatWorkerClient(
    (message) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
  );
  const kvStore = await makeSQLKVStore();

  // Create kernel channel for kernel commands
  const kernelStream = multiplexer.addChannel<
    KernelCommand,
    KernelCommandReply
  >('kernel', () => {
    // The kernel will handle commands through its own drain method
  });

  // Create and initialize kernel
  const kernel = new Kernel(kernelStream, vatWorkerClient, kvStore);
  await kernel.init();

  // Create panel channel for panel control messages
  const panelStream = multiplexer.addChannel<
    KernelControlCommand,
    KernelControlReply
  >('panel', async (message) => {
    const reply = await handlePanelMessage(kernel, message);
    await panelStream.write(reply);
  });

  // Run default kernel lifecycle
  await runVatLifecycle(kernel, ['v1', 'v2', 'v3']);
  await kernel.launchVat({ id: 'v0' });

  // Start multiplexer
  await multiplexer.drainAll();
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
