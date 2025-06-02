import '@metamask/kernel-shims/endoify';
import { Fail } from '@endo/errors';
import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { stringify, waitUntilQuiescent } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { NodejsVatWorkerService } from '@ocap/nodejs';
import { readFile } from 'node:fs/promises';

const DEFAULT_WORKER_FILE = new URL('../dist/vat-worker.mjs', import.meta.url)
  .pathname;

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
  options: {
    logger?: Logger;
  },
): Promise<unknown> {
  const logger = options.logger ?? new Logger('run-cluster');

  // Create kernel database
  const kernelDatabase = await makeSQLKernelDatabase({
    dbFilename: ':memory:',
    verbose: false,
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

  const kernelOptions = {
    resetStorage: true,
    logger: logger.subLogger('kernel'),
  };

  // Create kernel
  const kernel = await Kernel.make(
    kernelStream,
    vatWorkerService,
    kernelDatabase,
    kernelOptions,
  );

  // Create subcluster config
  const config: ClusterConfig = JSON.parse(await readFile(clusterPath, 'utf8'));

  // Launch subcluster and wait for quiescence
  const bootstrapResultRaw = await kernel.launchSubcluster(config);

  await waitUntilQuiescent(1000);

  // Unserialize the bootstrap result
  const result =
    kunser(bootstrapResultRaw ?? Fail`Bootstrap result is undefined`) ??
    Fail`Bootstrap result is undefined`;

  // If the result is an error, throw it
  if (
    typeof result === 'object' &&
    'name' in result &&
    typeof result.name === 'string' &&
    result.name.includes('Error')
  ) {
    throw new Error(
      (result as { message?: string }).message ??
        `Unknown error: ${stringify(result)}`,
    );
  }

  // Otherwise, return the result
  return result;
}
