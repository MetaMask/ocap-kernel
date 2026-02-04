import type { KernelDatabase } from '@metamask/kernel-store';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig, SystemVatConfig } from '@metamask/ocap-kernel';

import { NodejsPlatformServices } from '../../src/kernel/PlatformServices.ts';

type MakeTestKernelOptions = {
  mnemonic?: string;
  systemVats?: SystemVatConfig[];
};

/**
 * Helper function to create a kernel with an existing database.
 * This avoids creating the database twice.
 *
 * @param kernelDatabase - The kernel database to use.
 * @param resetStorage - Whether to reset the storage.
 * @param mnemonicOrOptions - Optional BIP39 mnemonic string or options bag.
 * @returns The kernel.
 */
export async function makeTestKernel(
  kernelDatabase: KernelDatabase,
  resetStorage: boolean,
  mnemonicOrOptions?: string | MakeTestKernelOptions,
): Promise<Kernel> {
  const options: MakeTestKernelOptions =
    typeof mnemonicOrOptions === 'string'
      ? { mnemonic: mnemonicOrOptions }
      : (mnemonicOrOptions ?? {});

  const logger = new Logger('test-kernel');
  const platformServices = new NodejsPlatformServices({
    logger: logger.subLogger({ tags: ['platform-services'] }),
  });
  const kernel = await Kernel.make(platformServices, kernelDatabase, {
    resetStorage,
    mnemonic: options.mnemonic,
    systemVats: options.systemVats,
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
