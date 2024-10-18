import './kernel-worker-trusted-prelude.js';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import { MessagePortDuplexStream, receiveMessagePort } from '@ocap/streams';

import { makeSQLKVStore } from './sqlite-kv-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

main('v0').catch(console.error);

/**
 * The main function for the kernel worker.
 *
 * @param defaultVatId - The id to give the default vat.
 */
async function main(defaultVatId: VatId): Promise<void> {
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
  await kernel.init({ defaultVatId });
}
