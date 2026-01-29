import type { Logger } from '@metamask/logger';

import { makeKernelFacet } from '../kernel-facet.ts';
import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import { SystemVatHandle } from './SystemVatHandle.ts';
import { kslot } from '../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  SystemVatId,
  SystemSubclusterId,
  KernelSystemSubclusterConfig,
  KRef,
} from '../types.ts';
import { ROOT_OBJECT_VREF } from '../types.ts';

/**
 * Result of connecting a system subcluster.
 */
export type SystemSubclusterConnectResult = {
  /** The ID of the connected system subcluster. */
  systemSubclusterId: SystemSubclusterId;
  /** Map of vat names to their system vat IDs. */
  vatIds: Record<string, SystemVatId>;
};

type SystemSubclusterManagerOptions = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  kernelFacetDeps: KernelFacetDependencies;
  logger: Logger;
};

/**
 * Internal record for a connected system subcluster.
 */
type SystemSubclusterRecord = {
  id: SystemSubclusterId;
  config: KernelSystemSubclusterConfig;
  vatIds: Record<string, SystemVatId>;
  handles: Map<SystemVatId, SystemVatHandle>;
};

/**
 * Manages system subclusters - subclusters whose vats run without compartment
 * isolation directly in the runtime process.
 *
 * System vats:
 * - Are created by the runtime (not the kernel)
 * - Connect to the kernel via transports
 * - Receive a kernel facet in the bootstrap message
 * - Don't participate in kernel persistence machinery
 */
export class SystemSubclusterManager {
  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** Dependencies for creating kernel facet services */
  readonly #kernelFacetDeps: KernelFacetDependencies;

  /** Logger for outputting messages to the console */
  readonly #logger: Logger;

  /** Counter for allocating system vat IDs */
  #nextSystemVatId: number = 0;

  /** Counter for allocating system subcluster IDs */
  #nextSystemSubclusterId: number = 0;

  /** Active system subclusters */
  readonly #subclusters: Map<SystemSubclusterId, SystemSubclusterRecord> =
    new Map();

  /** Singleton kernel facet (created lazily, kept alive for GC purposes) */
  // eslint-disable-next-line no-unused-private-class-members
  #kernelFacet: object | null = null;

  /** Kref of the singleton kernel facet */
  #kernelFacetKref: KRef | null = null;

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
   * Get the singleton kernel facet kref, creating it if necessary.
   *
   * @returns The kref for the kernel facet.
   */
  #getKernelFacetKref(): KRef {
    if (!this.#kernelFacetKref) {
      this.#kernelFacet = makeKernelFacet(this.#kernelFacetDeps);
      this.#kernelFacetKref = this.#kernelStore.initKernelObject('kernel');
    }
    return this.#kernelFacetKref;
  }

  /**
   * Connect to a system subcluster using provided transports.
   *
   * The runtime creates supervisors externally and provides transports for
   * communication. The kernel creates a kernel facet and delivers it in the
   * bootstrap message as a presence.
   *
   * @param config - Configuration for the system subcluster with transports.
   * @returns A promise for the connect result.
   */
  async connectSystemSubcluster(
    config: KernelSystemSubclusterConfig,
  ): Promise<SystemSubclusterConnectResult> {
    await this.#kernelQueue.waitForCrank();

    const bootstrapTransport = config.vatTransports.find(
      (vt) => vt.name === config.bootstrap,
    );
    if (!bootstrapTransport) {
      throw Error(`invalid bootstrap vat name ${config.bootstrap}`);
    }

    const systemSubclusterId = this.#allocateSystemSubclusterId();
    const vatIds: Record<string, SystemVatId> = {};
    const handles = new Map<SystemVatId, SystemVatHandle>();
    const rootKrefs: Record<string, KRef> = {};

    // Connect all system vats via their transports
    for (const vatTransport of config.vatTransports) {
      const { name: vatName, transport } = vatTransport;
      const systemVatId = this.#allocateSystemVatId();
      vatIds[vatName] = systemVatId;

      // Initialize the endpoint in the kernel store
      this.#kernelStore.initEndpoint(systemVatId);

      // Create the system vat handle (kernel-side) with the transport's deliver function
      const handle = new SystemVatHandle({
        systemVatId,
        kernelStore: this.#kernelStore,
        kernelQueue: this.#kernelQueue,
        deliver: transport.deliver,
        logger: this.#logger.subLogger({ tags: [systemVatId] }),
      });
      handles.set(systemVatId, handle);

      // Wire the syscall handler to the transport
      transport.setSyscallHandler(handle.getSyscallHandler());

      // Get or create the root kref (the root object is exported at o+0)
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

    // Get the singleton kernel facet kref
    const kernelFacetKref = this.#getKernelFacetKref();

    // Store the subcluster record
    const record: SystemSubclusterRecord = {
      id: systemSubclusterId,
      config,
      vatIds,
      handles,
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
          this.#logger.warn(`Kernel service '${serviceName}' not found`);
        }
      }
    }

    // Call bootstrap on the bootstrap vat's root object with kernelFacet as a presence
    const bootstrapVatId = vatIds[config.bootstrap];
    if (!bootstrapVatId) {
      throw new Error(`Bootstrap vat ID not found for ${config.bootstrap}`);
    }

    await this.#kernelQueue.enqueueMessage(
      rootKrefs[config.bootstrap] as KRef,
      'bootstrap',
      [roots, services, kslot(kernelFacetKref, 'KernelFacet')],
    );

    return {
      systemSubclusterId,
      vatIds,
    };
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
}
harden(SystemSubclusterManager);
