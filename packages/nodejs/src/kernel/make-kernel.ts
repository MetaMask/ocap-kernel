import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
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
 * @param options.logger - The logger to use for the kernel.
 * @returns The kernel, initialized.
 */
export async function makeKernel({
  port,
  workerFilePath,
  resetStorage = false,
  dbFilename,
  logger,
}: {
  port: NodeMessagePort;
  workerFilePath?: string;
  resetStorage?: boolean;
  dbFilename?: string;
  logger?: Logger;
}): Promise<Kernel> {
  const nodeStream = new NodeWorkerDuplexStream<
    JsonRpcRequest,
    JsonRpcResponse
  >(port);
  const rootLogger = logger ?? new Logger('kernel-worker');
  const vatWorkerClient = new NodejsVatWorkerManager({
    workerFilePath,
    logger: rootLogger.subLogger({ tags: ['vwm'] }),
  });

  // Initialize kernel store.
  const kernelDatabase = await makeSQLKernelDatabase({ dbFilename });

  // Create and start kernel.
  const kernel = await Kernel.make(
    nodeStream,
    vatWorkerClient,
    kernelDatabase,
    {
      resetStorage,
      logger: rootLogger.subLogger({ tags: ['kernel'] }),
    },
  );

  return kernel;
}
