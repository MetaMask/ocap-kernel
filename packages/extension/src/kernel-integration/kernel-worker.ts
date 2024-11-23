import type {
  KernelCommand,
  KernelCommandReply,
  ClusterConfig,
  VatWorkerServiceReply,
} from '@ocap/kernel';
import { isKernelCommand, isVatWorkerServiceReply, Kernel } from '@ocap/kernel';
import {
  MessagePortDuplexStream,
  PostMessageDuplexStream,
  receiveMessagePort,
  StreamMultiplexer,
} from '@ocap/streams';
import type { MultiplexEnvelope } from '@ocap/streams';
import { makeLogger } from '@ocap/utils';

import { handlePanelMessage } from './handle-panel-message.js';
import { isKernelControlCommand } from './messages.js';
import type { KernelControlCommand, KernelControlReply } from './messages.js';
import { makeSQLKVStore } from './sqlite-kv-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';
import type { VatWorkerClientStream } from './VatWorkerClient.js';

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

  const kernelServiceStream: VatWorkerClientStream =
    new PostMessageDuplexStream({
      postMessageFn: (message, transfer) => {
        transfer === undefined
          ? globalThis.postMessage(message)
          : // @ts-expect-error Wrong types for globalThis (we're in a worker)
            globalThis.postMessage(message, transfer);
      },
      setListener: (listener) =>
        globalThis.addEventListener('message', listener),
      removeListener: (listener) =>
        globalThis.removeEventListener('message', listener),
      messageEventMode: 'event',
      validateInput: (
        message,
      ): message is MessageEvent<VatWorkerServiceReply> =>
        message instanceof MessageEvent &&
        isVatWorkerServiceReply(message.data),
    });

  const baseStream = await MessagePortDuplexStream.make<
    MultiplexEnvelope,
    MultiplexEnvelope
  >(port);

  const multiplexer = new StreamMultiplexer(
    baseStream,
    'KernelWorkerMultiplexer',
  );

  // Initialize kernel dependencies
  const vatWorkerClient = new ExtensionVatWorkerClient(kernelServiceStream);
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
    // Run default kernel lifecycle
    kernel.launchSubcluster(defaultSubcluster),
    multiplexer.start(),
    panelStream.drain(async (message) => {
      const reply = await handlePanelMessage(kernel, message);
      await panelStream.write(reply);
    }),
  ]);
}
