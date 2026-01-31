import type { Logger } from '@metamask/logger';

import { makeKernelFacet } from '../kernel-facet.ts';
import type { KernelFacetDependencies } from '../kernel-facet.ts';
import type { KernelQueue } from '../KernelQueue.ts';
import { kser, kslot } from '../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../liveslots/kernel-marshal.ts';
import type { KernelStore } from '../store/index.ts';
import type {
  SystemVatId,
  SystemVatConfig,
  SystemVatRegistrationResult,
  KRef,
} from '../types.ts';
import { ROOT_OBJECT_VREF } from '../types.ts';
import { SystemVatHandle } from './SystemVatHandle.ts';

type SystemVatManagerOptions = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  kernelFacetDeps: KernelFacetDependencies;
  registerKernelService: (name: string, service: object) => { kref: string };
  logger: Logger;
};

/**
 * Internal record for a system vat.
 */
type SystemVatRecord = {
  id: SystemVatId;
  name: string;
  handle: SystemVatHandle;
  rootKref: KRef;
};

/**
 * Manages system vats - vats that run without compartment isolation
 * directly in the runtime process.
 *
 * System vats:
 * - Are created by the runtime (not the kernel)
 * - Connect to the kernel via transports
 * - Receive a kernel facet in the bootstrap message
 * - Don't participate in kernel persistence machinery
 *
 * The host vat (background/main vat) is configured at kernel construction time.
 * Additional system vats can be registered dynamically via the kernel facet.
 */
export class SystemVatManager {
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

  /** Active system vats indexed by ID */
  readonly #systemVats: Map<SystemVatId, SystemVatRecord> = new Map();

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
   * Creates a new SystemVatManager instance.
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
  }: SystemVatManagerOptions) {
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
   * Get the singleton kernel facet kref, creating and registering it if necessary.
   *
   * @returns The kref for the kernel facet.
   */
  #getKernelFacetKref(): KRef {
    if (!this.#kernelFacetKref) {
      // Pass `this` as systemVatManager for dynamic registration
      const depsWithManager = {
        ...this.#kernelFacetDeps,
        systemVatManager: this,
      };
      this.#kernelFacet = makeKernelFacet(depsWithManager);
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
   * Set up a system vat from a transport config.
   *
   * @param config - The system vat config with transport.
   * @returns The system vat ID and root kref.
   */
  #setupSystemVat(config: SystemVatConfig): {
    systemVatId: SystemVatId;
    rootKref: KRef;
  } {
    const { name, transport } = config;
    const systemVatId = this.#allocateSystemVatId();

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

    // Wire the syscall handler to the transport
    transport.setSyscallHandler(handle.getSyscallHandler());

    // Get or create the root kref (the root object is exported at o+0)
    let rootKref = this.#kernelStore.erefToKref(systemVatId, ROOT_OBJECT_VREF);
    if (!rootKref) {
      // Initialize the root object in the clist
      rootKref = this.#kernelStore.initKernelObject(systemVatId);
      this.#kernelStore.addCListEntry(systemVatId, rootKref, ROOT_OBJECT_VREF);
    }

    // Store the vat record
    const record: SystemVatRecord = {
      id: systemVatId,
      name,
      handle,
      rootKref,
    };
    this.#systemVats.set(systemVatId, record);

    return { systemVatId, rootKref };
  }

  /**
   * Register a system vat using a provided transport.
   *
   * The runtime creates the supervisor externally and provides the transport for
   * communication. This method sets up the kernel side and awaits connection
   * before sending the bootstrap message.
   *
   * For the host vat (configured at kernel construction), call this during kernel
   * init. For dynamic vats (UI instances, etc.), call via the kernel facet.
   *
   * @param config - Configuration for the system vat with transport.
   * @returns A promise for the registration result with system vat ID and disconnect function.
   */
  async registerSystemVat(
    config: SystemVatConfig,
  ): Promise<SystemVatRegistrationResult> {
    const { systemVatId, rootKref } = this.#setupSystemVat(config);

    // Get the singleton kernel facet kref
    const kernelFacetKref = this.#getKernelFacetKref();

    // Build roots object for bootstrap (just this vat's root)
    const roots: Record<string, SlotValue> = {
      [config.name]: kslot(rootKref, 'vatRoot'),
    };

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

    // Wait for connection then send bootstrap
    await config.transport.awaitConnection();
    this.#kernelQueue.enqueueSend(rootKref, {
      methargs: kser(['bootstrap', [roots, services]]),
    });

    // Return disconnect function for cleanup
    const disconnect = async (): Promise<void> => {
      await this.disconnectSystemVat(systemVatId);
    };

    return {
      systemVatId,
      rootKref,
      disconnect,
    };
  }

  /**
   * Disconnect and clean up a system vat.
   *
   * This performs full cleanup equivalent to vat termination:
   * - Rejects pending promises where this vat is the decider
   * - Deletes owned kernel objects (removes owner entries)
   * - Decrements reference counts for imported objects
   * - Cleans up c-list entries and adds orphaned krefs to GC
   *
   * @param systemVatId - The system vat ID to disconnect.
   */
  async disconnectSystemVat(systemVatId: SystemVatId): Promise<void> {
    const record = this.#systemVats.get(systemVatId);
    if (!record) {
      this.#logger.warn(`System vat ${systemVatId} not found for disconnect`);
      return;
    }

    // Reject pending promises where this vat is the decider
    const failure = kser(`System vat ${systemVatId} disconnected`);
    for (const kpid of this.#kernelStore.getPromisesByDecider(systemVatId)) {
      this.#kernelQueue.resolvePromises(systemVatId, [[kpid, true, failure]]);
    }

    // Clean up kernel state: exports, imports, promises, c-list entries
    const work = this.#kernelStore.cleanupTerminatedVat(systemVatId);
    this.#logger.debug(
      `System vat ${systemVatId} cleanup: ${work.exports} exports, ${work.imports} imports, ${work.promises} promises`,
    );

    // Remove the vat record from in-memory tracking
    this.#systemVats.delete(systemVatId);

    this.#logger.log(`Disconnected system vat ${systemVatId} (${record.name})`);
  }

  /**
   * Get a system vat handle by ID.
   *
   * @param systemVatId - The system vat ID.
   * @returns The system vat handle or undefined if not found.
   */
  getSystemVatHandle(systemVatId: SystemVatId): SystemVatHandle | undefined {
    const record = this.#systemVats.get(systemVatId);
    return record?.handle;
  }
}
harden(SystemVatManager);
