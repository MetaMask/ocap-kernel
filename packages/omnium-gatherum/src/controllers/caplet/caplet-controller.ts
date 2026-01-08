import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { ClusterConfig } from '@metamask/ocap-kernel';

import type {
  CapletId,
  CapletManifest,
  InstalledCaplet,
  InstallResult,
  LaunchResult,
} from './types.ts';
import { isCapletManifest } from './types.ts';
import type { ControllerStorage } from '../storage/controller-storage.ts';
import type { ControllerConfig } from '../types.ts';

/**
 * Caplet controller persistent state.
 * This is the shape of the state managed by the CapletController
 * through the ControllerStorage abstraction.
 */
export type CapletControllerState = {
  /** Installed caplets keyed by caplet ID */
  caplets: Record<CapletId, InstalledCaplet>;
};

/**
 * Methods exposed by the CapletController.
 */
export type CapletControllerMethods = {
  /**
   * Install a caplet.
   *
   * @param manifest - The caplet manifest.
   * @param _bundle - The caplet bundle (currently unused, bundle loaded from bundleSpec).
   * @returns The installation result.
   */
  install: (
    manifest: CapletManifest,
    _bundle?: unknown,
  ) => Promise<InstallResult>;

  /**
   * Uninstall a caplet.
   *
   * @param capletId - The ID of the caplet to uninstall.
   */
  uninstall: (capletId: CapletId) => Promise<void>;

  /**
   * List all installed caplets.
   *
   * @returns Array of installed caplets.
   */
  list: () => Promise<InstalledCaplet[]>;

  /**
   * Get a specific installed caplet.
   *
   * @param capletId - The caplet ID.
   * @returns The installed caplet or undefined if not found.
   */
  get: (capletId: CapletId) => Promise<InstalledCaplet | undefined>;

  /**
   * Find a caplet that provides a specific service.
   *
   * @param serviceName - The service name to search for.
   * @returns The installed caplet or undefined if not found.
   */
  getByService: (serviceName: string) => Promise<InstalledCaplet | undefined>;
};

/**
 * Dependencies for the CapletController.
 * These are attenuated - only the methods needed are provided.
 */
export type CapletControllerDeps = {
  /** State storage for caplet data */
  storage: ControllerStorage<CapletControllerState>;
  /** Launch a subcluster for a caplet */
  launchSubcluster: (config: ClusterConfig) => Promise<LaunchResult>;
  /** Terminate a caplet's subcluster */
  terminateSubcluster: (subclusterId: string) => Promise<void>;
};

/**
 * Create the CapletController.
 *
 * The CapletController manages the lifecycle of installed caplets:
 * - Installing caplets (validating manifest, launching subcluster, storing metadata)
 * - Uninstalling caplets (terminating subcluster, removing metadata)
 * - Querying installed caplets
 *
 * @param config - Controller configuration.
 * @param deps - Controller dependencies (attenuated for POLA).
 * @returns A hardened CapletController exo.
 */
export function makeCapletController(
  config: ControllerConfig,
  deps: CapletControllerDeps,
): CapletControllerMethods {
  const { logger } = config;
  const { storage, launchSubcluster, terminateSubcluster } = deps;

  /**
   * Get an installed caplet by ID (synchronous - reads from in-memory state).
   *
   * @param capletId - The caplet ID to retrieve.
   * @returns The installed caplet or undefined if not found.
   */
  const getCaplet = (capletId: CapletId): InstalledCaplet | undefined => {
    return storage.state.caplets[capletId];
  };

  /**
   * Get all installed caplets (synchronous - reads from in-memory state).
   *
   * @returns Array of all installed caplets.
   */
  const listCaplets = (): InstalledCaplet[] => {
    return Object.values(storage.state.caplets);
  };

  return makeDefaultExo('CapletController', {
    async install(
      manifest: CapletManifest,
      _bundle?: unknown,
    ): Promise<InstallResult> {
      const { id } = manifest;
      logger.info(`Installing caplet: ${id}`);

      // Validate manifest
      if (!isCapletManifest(manifest)) {
        throw new Error(`Invalid caplet manifest for ${id}`);
      }

      // Check if already installed
      if (storage.state.caplets[id] !== undefined) {
        throw new Error(`Caplet ${id} is already installed`);
      }

      // Create cluster config for this caplet
      const clusterConfig: ClusterConfig = {
        bootstrap: id,
        vats: {
          [id]: {
            bundleSpec: manifest.bundleSpec,
          },
        },
      };

      // Launch subcluster
      const { subclusterId } = await launchSubcluster(clusterConfig);

      // Store caplet data
      await storage.update((draft) => {
        draft.caplets[id] = {
          manifest,
          subclusterId,
          installedAt: Date.now(),
        };
      });

      logger.info(`Caplet ${id} installed with subcluster ${subclusterId}`);
      return { capletId: id, subclusterId };
    },

    async uninstall(capletId: CapletId): Promise<void> {
      logger.info(`Uninstalling caplet: ${capletId}`);

      const caplet = storage.state.caplets[capletId];
      if (caplet === undefined) {
        throw new Error(`Caplet ${capletId} not found`);
      }

      // Terminate the subcluster
      await terminateSubcluster(caplet.subclusterId);

      // Remove from storage
      await storage.update((draft) => {
        delete draft.caplets[capletId];
      });

      logger.info(`Caplet ${capletId} uninstalled`);
    },

    async list(): Promise<InstalledCaplet[]> {
      return listCaplets();
    },

    async get(capletId: CapletId): Promise<InstalledCaplet | undefined> {
      return getCaplet(capletId);
    },

    async getByService(
      serviceName: string,
    ): Promise<InstalledCaplet | undefined> {
      const caplets = listCaplets();
      return caplets.find((caplet: InstalledCaplet) =>
        caplet.manifest.providedServices.includes(serviceName),
      );
    },
  });
}
harden(makeCapletController);
