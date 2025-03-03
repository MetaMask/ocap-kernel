import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import { makeSQLKVStore } from '@ocap/store/sqlite/nodejs';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { MessagePort as NodeMessagePort } from 'node:worker_threads';

import { NodejsVatWorkerService } from './VatWorkerService.ts';

/**
 * The main function for the kernel worker.
 *
 * @param port - The kernel's end of a node:worker_threads MessageChannel
 * @param workerFilePath - The path to a file defining each vat worker's routine.
 * @param resetStorage - If true, clear kernel storage as part of setting up the kernel.
 * @returns The kernel, initialized.
 */
export async function makeKernel(
  port: NodeMessagePort,
  workerFilePath?: string,
  resetStorage: boolean = false,
): Promise<Kernel> {
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(port);
  const vatWorkerClient = new NodejsVatWorkerService({ workerFilePath });

  // Initialize kernel store.
  const kvStore = await makeSQLKVStore();

  // Create and start kernel.
  const kernel = new Kernel(nodeStream, vatWorkerClient, kvStore, {
    resetStorage,
  });
  await kernel.init();

  return kernel;
}
