import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/wasm';
import type { KernelDatabase } from '@metamask/kernel-store';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import type { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';
import { MessagePortDuplexStream } from '@metamask/streams/browser';

import { CfWorkerPlatformServices } from './PlatformServices.ts';

export async function makeKernel({
  port,
  resetStorage = false,
  dbFilename,
  logger,
  database,
}: {
  port: MessagePort;
  resetStorage?: boolean;
  dbFilename?: string;
  logger?: Logger;
  database?: KernelDatabase;
}): Promise<Kernel> {
  const stream = await MessagePortDuplexStream.make<
    JsonRpcRequest,
    JsonRpcResponse
  >(port);
  const rootLogger = logger ?? new Logger('cf-kernel-worker');
  const platformServicesClient = new CfWorkerPlatformServices({
    logger: rootLogger.subLogger({ tags: ['platform-services-manager'] }),
  });

  // Use provided database or create wasm SQLite for ephemeral storage
  const kernelDatabase = database ?? await makeSQLKernelDatabase({ dbFilename });

  const kernel = await Kernel.make(stream, platformServicesClient, kernelDatabase, {
    resetStorage,
    logger: rootLogger.subLogger({ tags: ['kernel'] }),
  });

  return kernel;
}


