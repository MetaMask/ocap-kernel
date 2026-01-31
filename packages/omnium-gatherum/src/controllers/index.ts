import { E } from '@endo/eventual-send';
import type { Logger } from '@metamask/logger';
import type { ClusterConfig, KernelFacet } from '@metamask/ocap-kernel';

import { CapletController } from './caplet/caplet-controller.ts';
import type { CapletControllerFacet, LaunchResult } from './caplet/index.ts';
import { makeChromeStorageAdapter } from './storage/index.ts';

// Base controller
export { Controller } from './base-controller.ts';
export type { ControllerConfig, ControllerMethods, FacetOf } from './types.ts';

// Storage
export type {
  StorageAdapter,
  ControllerStorageConfig,
} from './storage/index.ts';
export {
  makeChromeStorageAdapter,
  ControllerStorage,
} from './storage/index.ts';

// Caplet
export type {
  CapletId,
  SemVer,
  CapletManifest,
  InstalledCaplet,
  InstallResult,
  LaunchResult,
  CapletControllerState,
  CapletControllerFacet,
  CapletControllerDeps,
} from './caplet/index.ts';
export {
  isCapletId,
  isSemVer,
  isCapletManifest,
  assertCapletManifest,
  CapletIdStruct,
  SemVerStruct,
  CapletManifestStruct,
  CapletController,
} from './caplet/index.ts';

type InitializeControllersOptions = {
  logger: Logger;
  kernel: KernelFacet;
};

/**
 * Initializes the controllers for the host application.
 *
 * @param options - The options for initializing the controllers.
 * @param options.logger - The logger to use.
 * @param options.kernel - The kernel to use.
 * @returns The controllers for the host application.
 */
export async function initializeControllers({
  logger,
  kernel,
}: InitializeControllersOptions): Promise<{
  caplet: CapletControllerFacet;
}> {
  const storageAdapter = makeChromeStorageAdapter();

  const capletController = await CapletController.make(
    { logger: logger.subLogger({ tags: ['caplet'] }) },
    {
      adapter: storageAdapter,
      /**
       * Launch a subcluster for a caplet. Not concurrency safe.
       *
       * @param config - The configuration for the subcluster.
       * @returns The subcluster ID.
       */
      launchSubcluster: async (
        config: ClusterConfig,
      ): Promise<LaunchResult> => {
        const result = await E(kernel).launchSubcluster(config);
        return {
          subclusterId: result.subclusterId,
          rootKref: result.rootKref,
        };
      },
      terminateSubcluster: async (subclusterId: string): Promise<void> => {
        await E(kernel).terminateSubcluster(subclusterId);
      },
      getVatRoot: async (krefString: string): Promise<unknown> => {
        // Convert kref string to presence via kernel facade
        return E(kernel).getVatRoot(krefString);
      },
    },
  );

  return {
    caplet: capletController,
  };
}
