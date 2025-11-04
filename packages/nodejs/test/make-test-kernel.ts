import type { KernelDatabase } from '@metamask/kernel-store';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';

import { NodejsPlatformServices } from '../src/kernel/PlatformServices.ts';

/**
 * Helper function to create a kernel with an existing database.
 * This avoids creating the database twice.
 *
 * @param kernelDatabase - The kernel database to use.
 * @param resetStorage - Whether to reset the storage.
 * @returns The kernel.
 */
export async function makeTestKernel(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
): Promise<Kernel> {
  const port = new NodeMessageChannel().port1;
  const nodeStream = new NodeWorkerDuplexStream<
    JsonRpcRequest,
    JsonRpcResponse
  >(port);
  const logger = new Logger('test-kernel');
  const platformServices = new NodejsPlatformServices({
    logger: logger.subLogger({ tags: ['platform-services'] }),
  });
  const kernel = await Kernel.make(
    nodeStream,
    platformServices,
    kernelDatabase,
    {
      resetStorage,
      logger: logger.subLogger({ tags: ['kernel'] }),
    },
  );

  return kernel;
}
