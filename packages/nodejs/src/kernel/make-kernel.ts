import type { KernelCommand, KernelCommandReply } from '@ocap/kernel';
import { Kernel } from '@ocap/kernel';
import { makeSQLKernelDatabase } from '@ocap/store/sqlite/nodejs';
import { NodeWorkerDuplexStream } from '@ocap/streams';
import { MessagePort as NodeMessagePort } from 'node:worker_threads';

import { NodejsVatWorkerManager } from './VatWorkerManager.ts';

/**
 * The main function for the kernel worker.
 *
 * @param options - The options for the kernel.
 * @param options.port - The kernel's end of a node:worker_threads MessageChannel
 * @param options.workerFilePath - The path to a file defining each vat worker's routine.
 * @param options.resetStorage - If true, clear kernel storage as part of setting up the kernel.
 * @param options.dbFilename - The filename of the SQLite database file.
 * @returns The kernel, initialized.
 */
export async function makeKernel({
  port,
  workerFilePath,
  resetStorage = false,
  dbFilename,
}: {
  port: NodeMessagePort;
  workerFilePath?: string;
  resetStorage?: boolean;
  dbFilename?: string;
}): Promise<Kernel> {
  const nodeStream = new NodeWorkerDuplexStream<
    KernelCommand,
    KernelCommandReply
  >(port);
  const vatWorkerClient = new NodejsVatWorkerManager({ workerFilePath });

  // Initialize kernel store.
  const kernelDatabase = await makeSQLKernelDatabase({ dbFilename });

  // Create and start kernel.
  const kernel = await Kernel.make(
    nodeStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage,
    },
  );

  return kernel;
}
