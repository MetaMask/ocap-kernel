import type { CapData } from '@endo/marshal';
import { SubclusterNotFoundError } from '@metamask/kernel-errors';

import type { KernelQueue } from '../KernelQueue.ts';
import type { VatManager } from './VatManager.ts';
import { kslot, kunser } from '../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type { VatId, KRef, ClusterConfig, Subcluster } from '../types.ts';
import { isClusterConfig } from '../types.ts';
import { Fail } from '../utils/assert.ts';

type SubclusterManagerOptions = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  vatManager: VatManager;
  getKernelService: (name: string) => { kref: string } | undefined;
  queueMessage: (
    target: KRef,
    method: string,
    args: unknown[],
  ) => Promise<CapData<KRef>>;
};

/**
 * Manages subcluster operations including creation, termination, and reload.
 */
export class SubclusterManager {
  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** The vat manager for vat operations */
  readonly #vatManager: VatManager;

  /** Function to get kernel services */
  readonly #getKernelService: (name: string) => { kref: string } | undefined;

  /** Function to queue messages */
  readonly #queueMessage: (
    target: KRef,
    method: string,
    args: unknown[],
  ) => Promise<CapData<KRef>>;

  constructor({
    kernelStore,
    kernelQueue,
    vatManager,
    getKernelService,
    queueMessage,
  }: SubclusterManagerOptions) {
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#vatManager = vatManager;
    this.#getKernelService = getKernelService;
    this.#queueMessage = queueMessage;
    harden(this);
  }

  /**
   * Launches a sub-cluster of vats.
   *
   * @param config - Configuration object for sub-cluster.
   * @returns a promise for the (CapData encoded) result of the bootstrap message.
   */
  async launchSubcluster(
    config: ClusterConfig,
  ): Promise<CapData<KRef> | undefined> {
    await this.#kernelQueue.waitForCrank();
    isClusterConfig(config) || Fail`invalid cluster config`;
    if (!config.vats[config.bootstrap]) {
      Fail`invalid bootstrap vat name ${config.bootstrap}`;
    }
    const subclusterId = this.#kernelStore.addSubcluster(config);
    return this.#launchVatsForSubcluster(subclusterId, config);
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
    const vatIdsToTerminate = this.#kernelStore.getSubclusterVats(subclusterId);
    for (const vatId of vatIdsToTerminate.reverse()) {
      await this.#vatManager.terminateVat(vatId);
      this.#vatManager.collectGarbage();
    }
    this.#kernelStore.deleteSubcluster(subclusterId);
  }

  /**
   * Reloads a named subcluster by restarting all its vats.
   * This terminates and restarts all vats in the subcluster.
   *
   * @param subclusterId - The id of the subcluster to reload.
   * @returns A promise for an object containing the subcluster.
   * @throws If the subcluster is not found.
   */
  async reloadSubcluster(subclusterId: string): Promise<Subcluster> {
    await this.#kernelQueue.waitForCrank();
    const subcluster = this.getSubcluster(subclusterId);
    if (!subcluster) {
      throw new SubclusterNotFoundError(subclusterId);
    }
    for (const vatId of subcluster.vats.reverse()) {
      await this.#vatManager.terminateVat(vatId);
      this.#vatManager.collectGarbage();
    }
    const newId = this.#kernelStore.addSubcluster(subcluster.config);
    await this.#launchVatsForSubcluster(newId, subcluster.config);
    const newSubcluster = this.getSubcluster(newId);
    if (!newSubcluster) {
      throw new SubclusterNotFoundError(newId);
    }
    return newSubcluster;
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
   * Launches all vats for a subcluster and sets up their bootstrap connections.
   *
   * @param subclusterId - The ID of the subcluster to launch vats for.
   * @param config - The configuration for the subcluster.
   * @returns A promise for the (CapData encoded) result of the bootstrap message, if any.
   */
  async #launchVatsForSubcluster(
    subclusterId: string,
    config: ClusterConfig,
  ): Promise<CapData<KRef> | undefined> {
    const rootIds: Record<string, KRef> = {};
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const rootRef = await this.#vatManager.launchVat(vatConfig, subclusterId);
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
    const bootstrapRoot = rootIds[config.bootstrap];
    if (bootstrapRoot) {
      const result = await this.#queueMessage(bootstrapRoot, 'bootstrap', [
        roots,
        services,
      ]);
      const unserialized = kunser(result);
      if (unserialized instanceof Error) {
        throw unserialized;
      }
      return result;
    }
    return undefined;
  }

  /**
   * Reload all subclusters.
   * This is for debugging purposes only.
   */
  async reloadAllSubclusters(): Promise<void> {
    const subclusters = this.#kernelStore.getSubclusters();
    await this.#vatManager.terminateAllVats();
    for (const subcluster of subclusters) {
      await this.#kernelQueue.waitForCrank();
      const newId = this.#kernelStore.addSubcluster(subcluster.config);
      await this.#launchVatsForSubcluster(newId, subcluster.config);
    }
  }
}
harden(SubclusterManager);
