import type { KernelDatabase } from '@metamask/kernel-store';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';

import { NodejsPlatformServices } from '../../src/kernel/PlatformServices.ts';

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
  const logger = new Logger('test-kernel');
  const platformServices = new NodejsPlatformServices({
    logger: logger.subLogger({ tags: ['platform-services'] }),
  });
  const kernel = await Kernel.make(platformServices, kernelDatabase, {
    resetStorage,
    logger: logger.subLogger({ tags: ['kernel'] }),
  });

  return kernel;
}

/**
 * Run the set of test vats.
 *
 * @param kernel - The kernel to run in.
 * @param config - Subcluster configuration telling what vats to run.
 *
 * @returns the bootstrap result.
 */
export async function runTestVats(
  kernel: Kernel,
  config: ClusterConfig,
): Promise<unknown> {
  const { bootstrapResult } = await kernel.launchSubcluster(config);
  await waitUntilQuiescent();
  return bootstrapResult && kunser(bootstrapResult);
}
