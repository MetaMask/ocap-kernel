import type { Logger } from '@metamask/logger';

import { makeKernelFacet } from '../kernel-facet.ts';
import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import { SystemVatHandle } from './SystemVatHandle.ts';
import { kser, kslot } from '../liveslots/kernel-marshal.ts';
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
 * Result of preparing a system subcluster.
 */
export type SystemSubclusterPrepareResult = {
  /** The ID of the prepared system subcluster. */
  systemSubclusterId: SystemSubclusterId;
  /** Map of vat names to their system vat IDs. */
  vatIds: Record<string, SystemVatId>;
};

type SystemSubclusterManagerOptions = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  kernelFacetDeps: KernelFacetDependencies;
  registerKernelService: (name: string, service: object) => { kref: string };
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

  #kernelFacet: object | null = null;

  /** Kref of the singleton kernel facet */
  #kernelFacetKref: KRef | null = null;

  /** Function to register a kernel service */
  readonly #registerKernelService: (
    name: string,
    service: object,
  ) => { kref: string };

  /**
   * Creates a new SystemSubclusterManager instance.
   *
   * @param options - Constructor options.
   * @param options.kernelStore - The kernel's persistent state store.
   * @param options.kernelQueue - The kernel's message queue.
   * @param options.kernelFacetDeps - Dependencies for the kernel facet service.
   * @param options.registerKernelService - Function to register kernel services.
   * @param options.logger - Logger instance for debugging and diagnostics.
   */
  constructor({
    kernelStore,
    kernelQueue,
    kernelFacetDeps,
    registerKernelService,
    logger,
  }: SystemSubclusterManagerOptions) {
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#kernelFacetDeps = kernelFacetDeps;
    this.#registerKernelService = registerKernelService;
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
   * Get the singleton kernel facet kref, creating and registering it if necessary.
   *
   * @returns The kref for the kernel facet.
   */
  #getKernelFacetKref(): KRef {
    if (!this.#kernelFacetKref) {
      this.#kernelFacet = makeKernelFacet(this.#kernelFacetDeps);
      // Register the kernel facet as a kernel service so it can receive messages
      const { kref } = this.#registerKernelService(
        'kernelFacet',
        this.#kernelFacet,
      );
      this.#kernelFacetKref = kref;
    }
    return this.#kernelFacetKref;
  }

  /**
   * Prepare a system subcluster using provided transports.
   *
   * The runtime creates supervisors externally and provides transports for
   * communication. This method sets up the kernel side and returns immediately.
   * The actual connection and bootstrap happen asynchronously when the
   * supervisor-side initiates connection via the transport's `awaitConnection()`.
   *
   * The kernel is passive - it sets up to receive connections and waits for
   * the supervisor to push the connection. This push-based model supports
   * both same-process and cross-process transports.
   *
   * @param config - Configuration for the system subcluster with transports.
   * @returns The prepare result with IDs allocated for the subcluster.
   */
  prepareSystemSubcluster(
    config: KernelSystemSubclusterConfig,
  ): SystemSubclusterPrepareResult {
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

    // Set up all system vats via their transports (kernel side only)
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

    // Build services object - always include kernelFacet
    const services: Record<string, SlotValue> = {
      kernelFacet: kslot(kernelFacetKref, 'KernelFacet'),
    };
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

    // Get bootstrap target for the bootstrap message
    const bootstrapTarget = rootKrefs[config.bootstrap] as KRef;
    const bootstrapArgs = [roots, services];

    // Set up to send bootstrap after ALL vats in the subcluster are connected.
    // We wait for all transports' awaitConnection() to resolve before sending
    // the bootstrap message to ensure all vats are ready.
    const connectionPromises = config.vatTransports.map(async (vt) =>
      vt.transport.awaitConnection(),
    );
    Promise.all(connectionPromises)
      .then(() => {
        // All supervisors have connected. Now send the bootstrap message.
        // We use enqueueSend (fire-and-forget) because this runs asynchronously
        // after the kernel queue has started.
        this.#kernelQueue.enqueueSend(bootstrapTarget, {
          methargs: kser(['bootstrap', bootstrapArgs]),
        });
        return undefined;
      })
      .catch((error) => {
        this.#logger.error(`Failed to connect system subcluster:`, error);
      });

    // Return immediately - connection happens later when supervisor calls connect()
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
