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
import type { NamespacedStorage } from '../storage/types.ts';
import type { ControllerConfig } from '../types.ts';

/**
 * Storage keys used by the CapletController within its namespace.
 */
const STORAGE_KEYS = {
  /** List of installed caplet IDs */
  INSTALLED_LIST: 'installed',
  /** Suffix for manifest storage: `${capletId}.manifest` */
  MANIFEST_SUFFIX: '.manifest',
  /** Suffix for subclusterId storage: `${capletId}.subclusterId` */
  SUBCLUSTER_SUFFIX: '.subclusterId',
  /** Suffix for installedAt storage: `${capletId}.installedAt` */
  INSTALLED_AT_SUFFIX: '.installedAt',
} as const;

/**
 * Generate storage key for a caplet's manifest.
 *
 * @param capletId - The caplet ID.
 * @returns The storage key.
 */
const manifestKey = (capletId: CapletId): string =>
  `${capletId}${STORAGE_KEYS.MANIFEST_SUFFIX}`;

/**
 * Generate storage key for a caplet's subclusterId.
 *
 * @param capletId - The caplet ID.
 * @returns The storage key.
 */
const subclusterKey = (capletId: CapletId): string =>
  `${capletId}${STORAGE_KEYS.SUBCLUSTER_SUFFIX}`;

/**
 * Generate storage key for a caplet's installedAt timestamp.
 *
 * @param capletId - The caplet ID.
 * @returns The storage key.
 */
const installedAtKey = (capletId: CapletId): string =>
  `${capletId}${STORAGE_KEYS.INSTALLED_AT_SUFFIX}`;

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
  /** Namespaced storage for caplet data */
  storage: NamespacedStorage;
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
   * Get the list of installed caplet IDs.
   *
   * @returns Array of installed caplet IDs.
   */
  const getInstalledIds = async (): Promise<CapletId[]> => {
    const ids = await storage.get<CapletId[]>(STORAGE_KEYS.INSTALLED_LIST);
    return ids ?? [];
  };

  /**
   * Update the list of installed caplet IDs.
   *
   * @param ids - The list of caplet IDs to store.
   */
  const setInstalledIds = async (ids: CapletId[]): Promise<void> => {
    await storage.set(STORAGE_KEYS.INSTALLED_LIST, ids);
  };

  /**
   * Internal get implementation (to avoid `this` binding issues in exo).
   *
   * @param capletId - The caplet ID to retrieve.
   * @returns The installed caplet or undefined if not found.
   */
  const getCaplet = async (
    capletId: CapletId,
  ): Promise<InstalledCaplet | undefined> => {
    const manifest = await storage.get<CapletManifest>(manifestKey(capletId));
    if (manifest === undefined) {
      return undefined;
    }

    const [subclusterId, installedAt] = await Promise.all([
      storage.get<string>(subclusterKey(capletId)),
      storage.get<number>(installedAtKey(capletId)),
    ]);

    if (subclusterId === undefined || installedAt === undefined) {
      // Corrupted data - manifest exists but other fields don't
      logger.warn(`Caplet ${capletId} has corrupted storage data`);
      return undefined;
    }

    return {
      manifest,
      subclusterId,
      installedAt,
    };
  };

  /**
   * Internal list implementation (to avoid `this` binding issues in exo).
   *
   * @returns Array of all installed caplets.
   */
  const listCaplets = async (): Promise<InstalledCaplet[]> => {
    const installedIds = await getInstalledIds();
    const caplets: InstalledCaplet[] = [];

    for (const id of installedIds) {
      const caplet = await getCaplet(id);
      if (caplet !== undefined) {
        caplets.push(caplet);
      }
    }

    return caplets;
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
      const existing = await storage.get(manifestKey(id));
      if (existing !== undefined) {
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
      const now = Date.now();
      await Promise.all([
        storage.set(manifestKey(id), manifest),
        storage.set(subclusterKey(id), subclusterId),
        storage.set(installedAtKey(id), now),
      ]);

      // Update installed list
      const installedIds = await getInstalledIds();
      if (!installedIds.includes(id)) {
        await setInstalledIds([...installedIds, id]);
      }

      logger.info(`Caplet ${id} installed with subcluster ${subclusterId}`);
      return { capletId: id, subclusterId };
    },

    async uninstall(capletId: CapletId): Promise<void> {
      logger.info(`Uninstalling caplet: ${capletId}`);

      const subclusterId = await storage.get<string>(subclusterKey(capletId));
      if (subclusterId === undefined) {
        throw new Error(`Caplet ${capletId} not found`);
      }

      // Terminate the subcluster
      await terminateSubcluster(subclusterId);

      // Remove from storage
      await Promise.all([
        storage.delete(manifestKey(capletId)),
        storage.delete(subclusterKey(capletId)),
        storage.delete(installedAtKey(capletId)),
      ]);

      // Update installed list
      const installedIds = await getInstalledIds();
      await setInstalledIds(installedIds.filter((id) => id !== capletId));

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
      const caplets = await listCaplets();
      return caplets.find((caplet: InstalledCaplet) =>
        caplet.manifest.providedServices.includes(serviceName),
      );
    },
  });
}
harden(makeCapletController);
