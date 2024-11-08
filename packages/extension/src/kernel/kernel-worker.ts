import type {
  KernelCommand,
  KernelCommandReply,
  ClusterConfig,
} from '@ocap/kernel';
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
import { makeSQLKVStore } from './sqlite-kv-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

const bundleHost = 'http://localhost:3000'; // XXX placeholder
const sampleBundle = 'sample-vat.bundle';
const bundleURL = `${bundleHost}/${sampleBundle}`;

const defaultSubcluster: ClusterConfig = {
  bootstrap: 'alice',
  vats: {
    alice: {
      bundleSpec: bundleURL,
      parameters: {
        name: 'Alice',
      },
    },
    bob: {
      bundleSpec: bundleURL,
      parameters: {
        name: 'Bob',
      },
    },
    carol: {
      bundleSpec: bundleURL,
      parameters: {
        name: 'Carol',
      },
    },
  },
};

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
  await kernel.launchSubcluster(defaultSubcluster);

  // Start multiplexer
  await multiplexer.drainAll();
}
