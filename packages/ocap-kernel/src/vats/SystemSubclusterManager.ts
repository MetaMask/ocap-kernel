import type { Logger } from '@metamask/logger';

import { makeKernelFacet } from '../kernel-facet.ts';
import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import type { SystemVatDeliverFn } from './SystemVatHandle.ts';
import { SystemVatHandle } from './SystemVatHandle.ts';
import { kslot } from '../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  SystemVatId,
  SystemSubclusterId,
  SystemSubclusterConfig,
  SystemSubclusterLaunchResult,
  KRef,
} from '../types.ts';
import { ROOT_OBJECT_VREF } from '../types.ts';
import { SystemVatSupervisor } from './SystemVatSupervisor.ts';

/**
 * Callback type for connecting a system vat supervisor to the kernel.
 * Called when a system vat is launched.
 */
export type SystemVatConnectFn = (
  systemVatId: SystemVatId,
  deliver: SystemVatDeliverFn,
) => SystemVatHandle;

type SystemSubclusterManagerOptions = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  kernelFacetDeps: KernelFacetDependencies;
  logger?: Logger;
};

type SystemSubclusterRecord = {
  id: SystemSubclusterId;
  config: SystemSubclusterConfig;
  vatIds: Record<string, SystemVatId>;
  handles: Map<SystemVatId, SystemVatHandle>;
  supervisors: Map<SystemVatId, SystemVatSupervisor>;
};

/**
 * Manages system subclusters - subclusters whose vats run without compartment
 * isolation directly in the host process.
 *
 * System vats:
 * - Run without compartment isolation
 * - Don't participate in kernel persistence machinery
 * - The bootstrap vat receives a kernel facet as a vatpower
 */
export class SystemSubclusterManager {
  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** Dependencies for creating kernel facet services */
  readonly #kernelFacetDeps: KernelFacetDependencies;

  /** Logger for outputting messages to the console */
  readonly #logger: Logger | undefined;

  /** Counter for allocating system vat IDs */
  #nextSystemVatId: number = 0;

  /** Counter for allocating system subcluster IDs */
  #nextSystemSubclusterId: number = 0;

  /** Active system subclusters */
  readonly #subclusters: Map<SystemSubclusterId, SystemSubclusterRecord> =
    new Map();

  /**
   * Creates a new SystemSubclusterManager instance.
   *
   * @param options - Constructor options.
   * @param options.kernelStore - The kernel's persistent state store.
   * @param options.kernelQueue - The kernel's message queue.
   * @param options.kernelFacetDeps - Dependencies for the kernel facet service.
   * @param options.logger - Logger instance for debugging and diagnostics.
   */
  constructor({
    kernelStore,
    kernelQueue,
    kernelFacetDeps,
    logger,
  }: SystemSubclusterManagerOptions) {
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#kernelFacetDeps = kernelFacetDeps;
    this.#logger = logger;
    harden(this);
  }

  /**
   * Allocate a new system vat ID.
   *
   * @returns A new system vat ID.
   */
  #allocateSystemVatId(): SystemVatId {
    const id: SystemVatId = `sv${this.#nextSystemVatId}`;
    this.#nextSystemVatId += 1;
    return id;
  }

  /**
   * Allocate a new system subcluster ID.
   *
   * @returns A new system subcluster ID.
   */
  #allocateSystemSubclusterId(): SystemSubclusterId {
    const id: SystemSubclusterId = `ss${this.#nextSystemSubclusterId}`;
    this.#nextSystemSubclusterId += 1;
    return id;
  }

  /**
   * Launch a system subcluster.
   *
   * @param config - Configuration for the system subcluster.
   * @returns A promise for the launch result.
   */
  async launchSystemSubcluster(
    config: SystemSubclusterConfig,
  ): Promise<SystemSubclusterLaunchResult> {
    await this.#kernelQueue.waitForCrank();

    if (!config.vats[config.bootstrap]) {
      throw Error(`invalid bootstrap vat name ${config.bootstrap}`);
    }

    const systemSubclusterId = this.#allocateSystemSubclusterId();
    const vatIds: Record<string, SystemVatId> = {};
    const handles = new Map<SystemVatId, SystemVatHandle>();
    const supervisors = new Map<SystemVatId, SystemVatSupervisor>();
    const rootKrefs: Record<string, KRef> = {};

    // Create kernel facet for the bootstrap vat
    const kernelFacet = makeKernelFacet(this.#kernelFacetDeps);

    // Launch all system vats
    for (const [vatName, vatConfig] of Object.entries(config.vats)) {
      const systemVatId = this.#allocateSystemVatId();
      vatIds[vatName] = systemVatId;

      // Initialize the endpoint in the kernel store
      this.#kernelStore.initEndpoint(systemVatId);

      // Determine vatpowers - bootstrap vat gets the kernel facet
      const isBootstrap = vatName === config.bootstrap;
      const vatPowers: Record<string, unknown> = isBootstrap
        ? { kernelFacet }
        : {};

      // Create the system vat handle (kernel-side)
      // We need the deliver function from the supervisor, so we create
      // a deferred connection
      let supervisorDeliver: SystemVatDeliverFn | null = null;
      const deliver: SystemVatDeliverFn = async (delivery) => {
        if (!supervisorDeliver) {
          throw new Error('System vat supervisor not connected');
        }
        return supervisorDeliver(delivery);
      };

      const handle = new SystemVatHandle({
        systemVatId,
        kernelStore: this.#kernelStore,
        kernelQueue: this.#kernelQueue,
        deliver,
        logger: this.#logger?.subLogger({ tags: [systemVatId] }),
      });
      handles.set(systemVatId, handle);

      // Create the supervisor (which runs liveslots)
      const supervisorLogger = this.#logger?.subLogger({
        tags: [systemVatId, 'supervisor'],
      });
      if (!supervisorLogger) {
        throw new Error('Logger required for system vat supervisor');
      }
      const supervisor = new SystemVatSupervisor({
        id: systemVatId,
        buildRootObject: vatConfig.buildRootObject,
        vatPowers,
        parameters: vatConfig.parameters,
        executeSyscall: (vso) =>
          handle.getSyscallHandler()(vso) ?? harden(['ok', null]),
        logger: supervisorLogger,
      });
      supervisors.set(systemVatId, supervisor);

      // Connect the supervisor's deliver function to the handle
      supervisorDeliver = supervisor.deliver.bind(supervisor);

      // Start the vat
      const startError = await supervisor.start();
      if (startError) {
        throw new Error(`Failed to start system vat ${vatName}: ${startError}`);
      }

      // Get the root kref (the root object is exported at o+0)
      const existingRootKref = this.#kernelStore.erefToKref(
        systemVatId,
        ROOT_OBJECT_VREF,
      );
      if (existingRootKref) {
        rootKrefs[vatName] = existingRootKref;
      } else {
        // Initialize the root object in the clist
        const newRootKref = this.#kernelStore.initKernelObject(systemVatId);
        this.#kernelStore.addCListEntry(
          systemVatId,
          newRootKref,
          ROOT_OBJECT_VREF,
        );
        rootKrefs[vatName] = newRootKref;
      }
    }

    // Store the subcluster record
    const record: SystemSubclusterRecord = {
      id: systemSubclusterId,
      config,
      vatIds,
      handles,
      supervisors,
    };
    this.#subclusters.set(systemSubclusterId, record);

    // Build roots object for bootstrap
    const roots: Record<string, SlotValue> = {};
    for (const [vatName, kref] of Object.entries(rootKrefs)) {
      roots[vatName] = kslot(kref, 'vatRoot');
    }

    // Build services object
    const services: Record<string, SlotValue> = {};
    if (config.services) {
      for (const serviceName of config.services) {
        const serviceKref = this.#kernelStore.kv.get(
          `kernelService.${serviceName}`,
        );
        if (serviceKref) {
          services[serviceName] = kslot(serviceKref);
        } else {
          this.#logger?.warn(`Kernel service '${serviceName}' not found`);
        }
      }
    }

    // Call bootstrap on the bootstrap vat's root object
    const bootstrapVatId = vatIds[config.bootstrap];
    if (!bootstrapVatId) {
      throw new Error(`Bootstrap vat ID not found for ${config.bootstrap}`);
    }

    await this.#kernelQueue.enqueueMessage(
      rootKrefs[config.bootstrap] as KRef,
      'bootstrap',
      [roots, services],
    );

    return {
      systemSubclusterId,
      vatIds,
    };
  }

  /**
   * Terminate a system subcluster.
   *
   * @param systemSubclusterId - ID of the system subcluster to terminate.
   */
  async terminateSystemSubcluster(
    systemSubclusterId: SystemSubclusterId,
  ): Promise<void> {
    await this.#kernelQueue.waitForCrank();

    const record = this.#subclusters.get(systemSubclusterId);
    if (!record) {
      throw Error(`System subcluster ${systemSubclusterId} not found`);
    }

    // Terminate all handles
    for (const handle of record.handles.values()) {
      await handle.terminate(true);
    }

    this.#subclusters.delete(systemSubclusterId);
  }

  /**
   * Get a system vat handle by ID.
   *
   * @param systemVatId - The system vat ID.
   * @returns The system vat handle or undefined if not found.
   */
  getSystemVatHandle(systemVatId: SystemVatId): SystemVatHandle | undefined {
    for (const record of this.#subclusters.values()) {
      const handle = record.handles.get(systemVatId);
      if (handle) {
        return handle;
      }
    }
    return undefined;
  }

  /**
   * Get all system vat IDs.
   *
   * @returns Array of all system vat IDs.
   */
  getSystemVatIds(): SystemVatId[] {
    const ids: SystemVatId[] = [];
    for (const record of this.#subclusters.values()) {
      ids.push(...record.handles.keys());
    }
    return ids;
  }

  /**
   * Check if a system vat is active.
   *
   * @param systemVatId - The system vat ID to check.
   * @returns True if the system vat is active.
   */
  isSystemVatActive(systemVatId: SystemVatId): boolean {
    return this.getSystemVatHandle(systemVatId) !== undefined;
  }
}
harden(SystemSubclusterManager);
