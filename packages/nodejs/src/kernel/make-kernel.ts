import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { Logger } from '@metamask/logger';
import { Kernel } from '@metamask/ocap-kernel';
import type {
  IOChannelFactory,
  SystemSubclusterConfig,
} from '@metamask/ocap-kernel';

import { NodejsPlatformServices } from './PlatformServices.ts';
import { makeIOChannelFactory } from '../io/index.ts';

/**
 * The main function for the kernel worker.
 *
 * @param options - The options for the kernel.
 * @param options.workerFilePath - The path to a file defining each vat worker's routine.
 * @param options.resetStorage - If true, clear kernel storage as part of setting up the kernel.
 * @param options.dbFilename - The filename of the SQLite database file.
 * @param options.logger - The logger to use for the kernel.
 * @param options.keySeed - Optional seed for libp2p key generation.
 * @param options.ioChannelFactory - Optional factory for creating IO channels.
 * @param options.systemSubclusters - Optional system subcluster configurations.
 * @returns The kernel, initialized.
 */
export async function makeKernel({
  workerFilePath,
  resetStorage = false,
  dbFilename,
  logger,
  keySeed,
  ioChannelFactory,
  systemSubclusters,
}: {
  workerFilePath?: string;
  resetStorage?: boolean;
  dbFilename?: string;
  logger?: Logger;
  keySeed?: string | undefined;
  ioChannelFactory?: IOChannelFactory;
  systemSubclusters?: SystemSubclusterConfig[];
}): Promise<Kernel> {
  const rootLogger = logger ?? new Logger('kernel-worker');
  const platformServicesClient = new NodejsPlatformServices({
    workerFilePath,
    logger: rootLogger.subLogger({ tags: ['platform-services-manager'] }),
  });

  // Initialize kernel store.
  const kernelDatabase = await makeSQLKernelDatabase({ dbFilename });

  // Create and start kernel.
  const kernel = await Kernel.make(platformServicesClient, kernelDatabase, {
    resetStorage,
    logger: rootLogger.subLogger({ tags: ['kernel'] }),
    keySeed,
    ioChannelFactory: ioChannelFactory ?? makeIOChannelFactory(),
    ...(systemSubclusters ? { systemSubclusters } : {}),
  });

  return kernel;
}
