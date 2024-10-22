import './kernel-worker-trusted-prelude.js';
import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
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
  await kernel.init({ defaultVatId: 'v0' });

  console.log('Kernel started');

  await kernel.launchVat({ id: 'v1' });
  await kernel.launchVat({ id: 'v2' });
  await kernel.launchVat({ id: 'v3' });
  console.log('Kernel vats:', kernel.getVatIds());

  await kernel.restartVat('v2');
  console.log('Vat v2 restarted');

  console.log('Kernel vats:', kernel.getVatIds());

  await kernel.sendMessage('v1', {
    method: VatCommandMethod.Ping,
    params: null,
  });

  await kernel.deleteVat('v1');
  console.log('Vat v1 deleted');

  console.log('Kernel vats:', kernel.getVatIds());

  await kernel.sendMessage('v2', {
    method: VatCommandMethod.Ping,
    params: null,
  });
}
