import './kernel-worker-trusted-prelude.js';
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
  await kernel.init({ defaultVatId: 'v0' });

  const vats: VatId[] = ['v1', 'v2', 'v3'];

  console.time(`Created vats: ${vats.join(', ')}`);
  await Promise.all(vats.map(async (id) => kernel.launchVat({ id })));
  console.timeEnd(`Created vats: ${vats.join(', ')}`);

  console.log('Kernel vats:', kernel.getVatIds().join(', '));

  console.time('Vat "v2" restart');
  await kernel.restartVat('v2');
  console.timeEnd('Vat "v2" restart');

  console.time('Ping Vat "v1"');
  await kernel.sendMessage('v1', {
    method: VatCommandMethod.Ping,
    params: null,
  });
  console.timeEnd('Ping Vat "v1"');

  console.time(`Terminated vats: ${vats.join(', ')}`);
  for (const vatId of vats) {
    await kernel.terminateVat(vatId);
  }
  console.timeEnd(`Terminated vats: ${vats.join(', ')}`);

  console.log('Kernel vats:', kernel.getVatIds().join(', '));
}
