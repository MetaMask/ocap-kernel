import type { CapData } from '@endo/marshal';
import { SubclusterNotFoundError } from '@metamask/kernel-errors';
import { Logger } from '@metamask/logger';

import type { IOManager } from '../io/IOManager.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { VatManager } from './VatManager.ts';
import { kslot, kunser } from '../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  VatId,
  KRef,
  ClusterConfig,
  Subcluster,
  SubclusterLaunchResult,
  SystemSubclusterConfig,
} from '../types.ts';
import { isClusterConfig } from '../types.ts';
import { Fail } from '../utils/assert.ts';

type SubclusterManagerOptions = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  vatManager: VatManager;
  getKernelService: (
    name: string,
  ) => { kref: string; systemOnly: boolean } | undefined;
  queueMessage: (
    target: KRef,
    method: string,
    args: unknown[],
  ) => Promise<CapData<KRef>>;
  ioManager?: IOManager;
  logger?: Logger;
};

/**
 * Manages subcluster operations including creation and termination.
 */
export class SubclusterManager {
  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The vat manager for vat operations */
  readonly #vatManager: VatManager;

  /** Function to get kernel services */
  readonly #getKernelService: (
    name: string,
  ) => { kref: string; systemOnly: boolean } | undefined;

  /** Function to queue messages */
  readonly #queueMessage: (
    target: KRef,
    method: string,
    args: unknown[],
  ) => Promise<CapData<KRef>>;

  /** Logger for diagnostic output */
  readonly #logger: Logger;

  /** Optional IO manager for creating/destroying IO channels */
  readonly #ioManager: IOManager | undefined;

  /** Stores bootstrap root krefs of launched system subclusters */
  readonly #systemSubclusterRoots: Map<string, KRef> = new Map();

  /**
   * Creates a new SubclusterManager instance.
   *
   * @param options - Constructor options.
   * @param options.kernelStore - The kernel's persistent state store.
   * @param options.kernelQueue - The kernel's message queue for scheduling deliveries.
   * @param options.vatManager - Manager for creating and managing vat instances.
   * @param options.getKernelService - Function to retrieve a kernel service by its kref.
   * @param options.queueMessage - Function to queue messages for delivery to targets.
   * @param options.ioManager - Optional IO manager for IO channel lifecycle.
   * @param options.logger - Optional logger for diagnostic output.
   */
  constructor({
    kernelStore,
    kernelQueue,
    vatManager,
    getKernelService,
    queueMessage,
    ioManager,
    logger,
  }: SubclusterManagerOptions) {
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#vatManager = vatManager;
    this.#getKernelService = getKernelService;
    this.#queueMessage = queueMessage;
    this.#ioManager = ioManager;
    this.#logger = logger ?? new Logger('SubclusterManager');
    harden(this);
  }

  /**
   * Launches a sub-cluster of vats.
   *
   * @param config - Configuration object for sub-cluster.
   * @param options - Launch options.
   * @param options.isSystem - Whether this is a system subcluster. System
   * subclusters may access restricted kernel services. Defaults to `false`.
   * @returns A promise for the subcluster ID, bootstrap root kref, and
   * bootstrap result.
   */
  async launchSubcluster(
    config: ClusterConfig,
    { isSystem = false }: { isSystem?: boolean } = {},
  ): Promise<SubclusterLaunchResult> {
    await this.#kernelQueue.waitForCrank();
    isClusterConfig(config) || Fail`invalid cluster config`;
    if (!config.vats[config.bootstrap]) {
      Fail`invalid bootstrap vat name ${config.bootstrap}`;
    }
    const subclusterId = this.#kernelStore.addSubcluster(config);

    try {
      // Create IO channels before validating services so that IO service
      // names are registered and discoverable by #validateServices.
      if (config.io && this.#ioManager) {
        await this.#ioManager.createChannels(subclusterId, config.io);
      }

      this.#validateServices(config, isSystem);
      const { rootKref, bootstrapResult } = await this.#launchVatsForSubcluster(
        subclusterId,
        config,
      );
      return { subclusterId, rootKref, bootstrapResult };
    } catch (error) {
      // Roll back IO channels and persisted subcluster on failure
      if (this.#ioManager) {
        await this.#ioManager.destroyChannels(subclusterId);
      }
      this.#kernelStore.deleteSubcluster(subclusterId);
      throw error;
    }
  }

  /**
   * Terminates a named sub-cluster of vats.
   *
   * @param subclusterId - The id of the subcluster to terminate.
   * @returns A promise that resolves when termination is complete.
   */
  async terminateSubcluster(subclusterId: string): Promise<void> {
    await this.#kernelQueue.waitForCrank();
    if (!this.#kernelStore.getSubcluster(subclusterId)) {
      throw new SubclusterNotFoundError(subclusterId);
    }

    // Clean up system subcluster mapping if this is a system subcluster
    const mappings = this.#kernelStore.getAllSystemSubclusterMappings();
    for (const [name, mappedSubclusterId] of mappings) {
      if (mappedSubclusterId === subclusterId) {
        this.#systemSubclusterRoots.delete(name);
        this.#kernelStore.deleteSystemSubclusterMapping(name);
        this.#logger.info(`Cleaned up system subcluster mapping "${name}"`);
        break;
      }
    }

    const vatIdsToTerminate = this.#kernelStore.getSubclusterVats(subclusterId);
    for (const vatId of vatIdsToTerminate.reverse()) {
      await this.#vatManager.terminateVat(vatId);
      this.#vatManager.collectGarbage();
    }

    // Destroy IO channels after terminating vats so that any queued
    // messages targeting IO service krefs are drained first.
    if (this.#ioManager) {
      await this.#ioManager.destroyChannels(subclusterId);
    }
    this.#kernelStore.deleteSubcluster(subclusterId);
  }

  /**
   * Retrieves a subcluster by its ID.
   *
   * @param subclusterId - The id of the subcluster.
   * @returns The subcluster, or undefined if not found.
   */
  getSubcluster(subclusterId: string): Subcluster | undefined {
    return this.#kernelStore.getSubcluster(subclusterId);
  }

  /**
   * Gets all subclusters.
   *
   * @returns An array of subcluster information records.
   */
  getSubclusters(): Subcluster[] {
    return this.#kernelStore.getSubclusters();
  }

  /**
   * Checks if a vat belongs to a specific subcluster.
   *
   * @param vatId - The ID of the vat to check.
   * @param subclusterId - The ID of the subcluster to check against.
   * @returns True if the vat belongs to the specified subcluster, false otherwise.
   */
  isVatInSubcluster(vatId: VatId, subclusterId: string): boolean {
    return this.#kernelStore.getVatSubcluster(vatId) === subclusterId;
  }

  /**
   * Gets all vat IDs that belong to a specific subcluster.
   *
   * @param subclusterId - The ID of the subcluster to get vats for.
   * @returns An array of vat IDs that belong to the specified subcluster.
   */
  getSubclusterVats(subclusterId: string): VatId[] {
    return this.#kernelStore.getSubclusterVats(subclusterId);
  }

  /**
   * Deletes a subcluster and its vat data from storage without terminating running vats.
   * This is used for cleaning up orphaned subclusters before vats are started.
   *
   * @param subclusterId - The ID of the subcluster to delete.
   */
  deleteSubcluster(subclusterId: string): void {
    const subcluster = this.#kernelStore.getSubcluster(subclusterId);
    if (!subcluster) {
      return;
    }

    // Delete vat configs and mark vats as terminated so their data will be cleaned up
    for (const vatId of Object.values(subcluster.vats)) {
      this.#kernelStore.deleteVatConfig(vatId);
      this.#kernelStore.markVatAsTerminated(vatId);
    }

    // Delete the subcluster record
    this.#kernelStore.deleteSubcluster(subclusterId);
  }

  /**
   * Validates that all requested services exist and are accessible.
   *
   * @param config - The cluster configuration to validate.
   * @param isSystem - Whether this is a system subcluster.
   * @throws If a requested service does not exist or is system-only and the
   * subcluster is not a system subcluster.
   */
  #validateServices(config: ClusterConfig, isSystem: boolean): void {
    if (!config.services) {
      return;
    }
    for (const name of config.services) {
      const service = this.#getKernelService(name);
      if (!service || (service.systemOnly && !isSystem)) {
        throw Error(`no registered kernel service '${name}'`);
      }
    }
  }

  /**
   * Launches all vats for a subcluster and sets up their bootstrap connections.
   *
   * @param subclusterId - The ID of the subcluster to launch vats for.
   * @param config - The configuration for the subcluster.
   * @returns A promise for the bootstrap root kref and bootstrap result.
   */
  async #launchVatsForSubcluster(
    subclusterId: string,
    config: ClusterConfig,
  ): Promise<{
    rootKref: KRef;
    bootstrapResult: CapData<KRef> | undefined;
  }> {
    const rootIds: Record<string, KRef> = {};
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const rootRef = await this.#vatManager.launchVat(
        vatConfig,
        vatName,
        subclusterId,
      );
      rootIds[vatName] = rootRef;
      roots[vatName] = kslot(rootRef, 'vatRoot');
    }
    const services: Record<string, SlotValue> = {};
    if (config.services) {
      for (const name of config.services) {
        const possibleService = this.#getKernelService(name);
        if (possibleService) {
          const { kref } = possibleService;
          services[name] = kslot(kref);
        } else {
          throw Error(`no registered kernel service '${name}'`);
        }
      }
    }
    const rootKref = rootIds[config.bootstrap];
    if (!rootKref) {
      throw new Error(
        `Bootstrap vat "${config.bootstrap}" not found in rootIds`,
      );
    }
    const bootstrapResult = await this.#queueMessage(rootKref, 'bootstrap', [
      roots,
      services,
    ]);
    const unserialized = kunser(bootstrapResult);
    if (unserialized instanceof Error) {
      throw unserialized;
    }
    return { rootKref, bootstrapResult };
  }

  /**
   * Initialize system subclusters from persisted state.
   * Validates no duplicate names, deletes orphaned subclusters, and restores
   * mappings for existing ones. Must be called before vat initialization.
   *
   * @param configs - Array of system subcluster configurations.
   */
  initSystemSubclusters(configs: SystemSubclusterConfig[]): void {
    // Validate no duplicate system subcluster names
    const names = new Set(configs.map((config) => config.name));
    if (names.size !== configs.length) {
      throw new Error('Duplicate system subcluster names in config');
    }

    this.#restorePersistedSystemSubclusters(configs);
  }

  /**
   * Launch new system subclusters that aren't already in persistence.
   * This must be called after the kernel queue is running since launchSubcluster
   * sends bootstrap messages.
   *
   * @param configs - Array of system subcluster configurations.
   */
  async launchNewSystemSubclusters(
    configs: SystemSubclusterConfig[],
  ): Promise<void> {
    // Filter to only configs that weren't restored from persistence
    const newConfigs = configs.filter(
      ({ name }) => !this.#systemSubclusterRoots.has(name),
    );

    if (newConfigs.length === 0) {
      return;
    }

    for (const { name, config } of newConfigs) {
      const result = await this.launchSubcluster(config, { isSystem: true });
      this.#systemSubclusterRoots.set(name, result.rootKref);

      // Persist the mapping
      this.#kernelStore.setSystemSubclusterMapping(name, result.subclusterId);

      this.#logger.info(`Launched new system subcluster "${name}"`);
    }
  }

  /**
   * Get the bootstrap root kref of a system subcluster by name.
   *
   * @param name - The name of the system subcluster.
   * @returns The bootstrap root kref.
   * @throws If the system subcluster is not found.
   */
  getSystemSubclusterRoot(name: string): KRef {
    const kref = this.#systemSubclusterRoots.get(name);
    if (kref === undefined) {
      throw new Error(`System subcluster "${name}" not found`);
    }
    return kref;
  }

  /**
   * Clear all system subcluster root state.
   * Called by the kernel during reset.
   */
  clearSystemSubclusters(): void {
    this.#systemSubclusterRoots.clear();
  }

  /**
   * Restore persisted system subclusters before vat initialization.
   * - Deletes orphaned subclusters (no longer in config) so their vats aren't started
   * - Restores mappings for existing subclusters
   *
   * @param configs - Array of system subcluster configurations.
   * @returns Whether any valid persisted subclusters were restored.
   */
  #restorePersistedSystemSubclusters(
    configs: SystemSubclusterConfig[],
  ): boolean {
    const persistedMappings =
      this.#kernelStore.getAllSystemSubclusterMappings();

    if (persistedMappings.size === 0) {
      return false;
    }

    const configNames = new Set(configs.map((config) => config.name));
    let hasValidPersistedSubclusters = false;

    for (const [name, subclusterId] of persistedMappings) {
      if (!configNames.has(name)) {
        // This system subcluster no longer has a config - delete it
        this.#logger.info(
          `System subcluster "${name}" no longer in config, deleting`,
        );
        this.deleteSubcluster(subclusterId);
        this.#kernelStore.deleteSystemSubclusterMapping(name);
        continue;
      }

      // Subcluster has a config - try to restore it
      const subcluster = this.getSubcluster(subclusterId);
      if (!subcluster) {
        this.#logger.warn(
          `System subcluster "${name}" mapping points to non-existent subcluster ${subclusterId}, cleaning up`,
        );
        this.#kernelStore.deleteSystemSubclusterMapping(name);
        continue;
      }

      const bootstrapVatId = subcluster.vats[subcluster.config.bootstrap];
      if (!bootstrapVatId) {
        throw new Error(
          `System subcluster "${name}" has no bootstrap vat - database may be corrupted`,
        );
      }

      const rootKref = this.#kernelStore.getRootObject(bootstrapVatId);
      if (!rootKref) {
        throw new Error(
          `System subcluster "${name}" has no root object - database may be corrupted`,
        );
      }

      this.#systemSubclusterRoots.set(name, rootKref);
      hasValidPersistedSubclusters = true;
      this.#logger.info(`Restored system subcluster "${name}"`);
    }

    return hasValidPersistedSubclusters;
  }
}
harden(SubclusterManager);
