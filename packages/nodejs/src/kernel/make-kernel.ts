import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { isKernelCommand, Kernel } from '@ocap/kernel';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { MessagePort as NodeMessagePort } from 'node:worker_threads';

import { makeSQLKVStore } from './sqlite-kv-store.js';
import { NodejsVatWorkerService } from './VatWorkerService.js';

/**
 * The main function for the kernel worker.
 *
 * @param port - The kernel's end of a node:worker_threads MessageChannel
 * @param workerFilePath - The path to a file defining each vat worker's routine.
 * @returns The kernel, initialized.
 */
export async function makeKernel(
  port: NodeMessagePort,
  workerFilePath?: string,
): Promise<Kernel> {
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(port, isKernelCommand);
  const vatWorkerClient = new NodejsVatWorkerService({ workerFilePath });

  // Initialize kernel store.
  const kvStore = await makeSQLKVStore();
  kvStore.clear();

  // Create and start kernel.
  const kernel = new Kernel(nodeStream, vatWorkerClient, kvStore);
  await kernel.init();

  return kernel;
}
