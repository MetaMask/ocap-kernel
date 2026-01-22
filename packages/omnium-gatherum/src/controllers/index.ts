import { E } from '@endo/eventual-send';
import type { KernelFacade } from '@metamask/kernel-browser-runtime';
import type { Logger } from '@metamask/logger';
import type { ClusterConfig } from '@metamask/ocap-kernel';

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
  kernel: KernelFacade | Promise<KernelFacade>;
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
        const statusBefore = await E(kernel).getStatus();
        const beforeIds = new Set(
          statusBefore.subclusters.map((subcluster) => subcluster.id),
        );

        await E(kernel).launchSubcluster(config);

        const statusAfter = await E(kernel).getStatus();
        const newSubcluster = statusAfter.subclusters.find(
          (subcluster) => !beforeIds.has(subcluster.id),
        );

        if (!newSubcluster) {
          throw new Error('Failed to determine subclusterId after launch');
        }

        return { subclusterId: newSubcluster.id };
      },
      terminateSubcluster: async (subclusterId: string): Promise<void> => {
        await E(kernel).terminateSubcluster(subclusterId);
      },
    },
  );

  return {
    caplet: capletController,
  };
}
