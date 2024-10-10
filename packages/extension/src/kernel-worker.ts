import './kernel-worker-trusted-prelude.js';
import type { KernelCommand, KernelCommandReply, VatId } from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import { PostMessageDuplexStream } from '@ocap/streams';

import { makeKernelStore } from './sqlite-kernel-store.js';
import { ExtensionVatWorkerClient } from './VatWorkerClient.js';

main('v0').catch(console.error);

/**
 * The main function for the kernel worker.
 *
 * @param defaultVatId - The id to give the default vat.
 */
async function main(defaultVatId: VatId): Promise<void> {
  const kernelStream = new PostMessageDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(
    (message) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
    (listener) => globalThis.removeEventListener('message', listener),
  );

  // Initialize vat worker service.

  const vatWorkerClient = new ExtensionVatWorkerClient(
    (message: unknown) => globalThis.postMessage(message),
    (listener) => globalThis.addEventListener('message', listener),
  );

  // Initialize kernel store. (to be initialized in kernel.init in the future)

  const kernelStore = await makeKernelStore();

  // Create and start kernel.

  const kernel = new Kernel(kernelStream, vatWorkerClient, kernelStore);
  await kernel.init({ defaultVatId });
}
