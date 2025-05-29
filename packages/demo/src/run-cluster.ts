import '@metamask/kernel-shims/endoify';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { NodejsVatWorkerService } from '@ocap/nodejs';
import { readFile } from 'node:fs/promises';

import { DEFAULT_WORKER_FILE } from './constants.ts';

/**
 * Run a cluster config with the ocap kernel.
 *
 * @param clusterPath - Path to the clusterConfig file
 * @param options - Options for the cluster
 * @param options.logger - Logger to use for the cluster
 * @returns The result of calling the method
 */
export async function runCluster(
  clusterPath: string,
  { logger = new Logger({}) }: { logger?: Logger },
): Promise<void> {
  // Create kernel database
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: ':memory:',
    logger: logger.subLogger('db'),
  });

  // Create message channel for kernel communication
  const { port1 } = new MessageChannel();
  const kernelStream = new NodeWorkerDuplexStream<
    JsonRpcRequest,
    JsonRpcResponse
  >(port1);

  // Create vat worker service
  const vatWorkerService = new NodejsVatWorkerService({
    workerFilePath: DEFAULT_WORKER_FILE,
    logger: logger.subLogger('vat-worker'),
  });

  // Create kernel
  const kernel = await Kernel.make(
    kernelStream,
    vatWorkerService,
    kernelDatabase,
    {
      resetStorage: true,
      logger: logger.subLogger('kernel'),
    },
  );

  // Create subcluster config
  const config: ClusterConfig = JSON.parse(await readFile(clusterPath, 'utf8'));

  // Launch subcluster and wait for quiescence
  await kernel.launchSubcluster(config);

  await waitUntilQuiescent(1000);
}
