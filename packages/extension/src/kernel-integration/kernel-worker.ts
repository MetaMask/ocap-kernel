import type {
  KernelCommand,
  KernelCommandReply,
  ClusterConfig,
} from '@ocap/kernel';
import { isKernelCommand, Kernel } from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  receiveMessagePort,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MultiplexEnvelope, PostMessageTarget } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { handlePanelMessage } from './handle-panel-message.js';
import { isKernelControlCommand } from './messages.js';
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
  const vatWorkerClient = ExtensionVatWorkerClient.make(
    globalThis as PostMessageTarget,
  );
  const kvStore = await makeSQLKVStore();

  // This stream is drained by the kernel.
  const kernelStream = multiplexer.createChannel<
    KernelCommand,
    KernelCommandReply
  >('kernel', isKernelCommand);

  const kernel = new Kernel(kernelStream, vatWorkerClient, kvStore);
  await kernel.init();

  // We have to drain this stream here.
  const panelStream = multiplexer.createChannel<
    KernelControlCommand,
    KernelControlReply
  >('panel', isKernelControlCommand);

  await Promise.all([
    vatWorkerClient.start(),
    multiplexer.start(),
    panelStream.drain(async (message) => {
      const reply = await handlePanelMessage(kernel, kvStore, message);
      await panelStream.write(reply);
    }),
    // XXX We are mildly concerned that there's a small chance that a race here
    // could cause startup to flake non-deterministically. If the invocation
    // here of `launchSubcluster` turns out to depend on aspects of the IPC
    // setup completing successfully but those pieces aren't ready in time, then
    // it could get stuck.  Current experience suggests this is not a problem,
    // but as yet have only an intuitive sense (i.e., promises, yay) why this
    // might be true rather than a principled explanation that it is necessarily
    // true. Hence this comment to serve as a marker if some problem crops up
    // with startup wedging and some poor soul is reading through the code
    // trying to diagnose it.
    (async () => {
      const roots = await kernel.launchSubcluster(defaultSubcluster);
      console.log(`Subcluster launched: ${JSON.stringify(roots)}`);
    })(),
  ]);
}
