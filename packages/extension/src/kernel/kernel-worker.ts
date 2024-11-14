import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MultiplexEnvelope } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { handlePanelMessage } from './handle-panel-message.js';
import type { KernelControlCommand, KernelControlReply } from './messages.js';
import { runVatLifecycle } from './run-vat-lifecycle.js';
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
