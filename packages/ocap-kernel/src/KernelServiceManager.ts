import { E } from '@endo/eventual-send';
import type { Logger } from '@metamask/logger';

import type { KernelQueue } from './KernelQueue.ts';
import { kser, kunser, makeKernelError } from './liveslots/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import type { KRef, KernelMessage } from './types.ts';
import { assert } from './utils/assert.ts';

export type KernelService = {
  name: string;
  kref: KRef;
  service: object;
  systemOnly: boolean;
};

type KernelServiceManagerConstructorProps = {
  kernelStore: KernelStore;
  kernelQueue: KernelQueue;
  logger?: Logger;
};

/**
 * Manages kernel services registration and invocation.
 */
export class KernelServiceManager {
  /** Storage holding the kernel's persistent state */
  readonly #kernelStore: KernelStore;

  /** The kernel's run queue */
  readonly #kernelQueue: KernelQueue;

  /** Logger for outputting messages to the console */
  readonly #logger: Logger | undefined;

  /** Objects providing custom or kernel-privileged services to vats, indexed by name */
  readonly #kernelServicesByName: Map<string, KernelService> = new Map();

  /** Objects providing custom or kernel-privileged services to vats, indexed by kref */
  readonly #kernelServicesByObject: Map<KRef, KernelService> = new Map();

  /**
   * Creates a new KernelServiceManager instance.
   *
   * @param options - Constructor options.
   * @param options.kernelStore - The kernel's persistent state store.
   * @param options.kernelQueue - The kernel's message queue for scheduling deliveries.
   * @param options.logger - Logger instance for debugging and diagnostics.
   */
  constructor({
    kernelStore,
    kernelQueue,
    logger,
  }: KernelServiceManagerConstructorProps) {
    this.#kernelStore = kernelStore;
    this.#kernelQueue = kernelQueue;
    this.#logger = logger;
  }

  /**
   * Register a kernel service object.
   *
   * @param name - The name of the service.
   * @param service - The service object.
   * @param options - Registration options.
   * @param options.systemOnly - Whether the service is only available to system
   * subclusters. Defaults to `false`.
   * @returns The registered kernel service with its kref.
   */
  registerKernelServiceObject(
    name: string,
    service: object,
    { systemOnly = false }: { systemOnly?: boolean } = {},
  ): KernelService {
    if (this.#kernelServicesByName.has(name)) {
      throw new Error(`Kernel service "${name}" is already registered`);
    }
    let kref = this.#kernelStore.getKernelServiceKref(name);
    if (!kref) {
      kref = this.#kernelStore.initKernelObject('kernel');
      this.#kernelStore.setKernelServiceKref(name, kref);
      this.#kernelStore.pinObject(kref);
    }
    const kernelService = { name, kref, service, systemOnly };
    this.#kernelServicesByName.set(name, kernelService);
    this.#kernelServicesByObject.set(kref, kernelService);
    return kernelService;
  }

  /**
   * Unregister a kernel service object by name.
   *
   * @param name - The name of the service to unregister.
   */
  unregisterKernelServiceObject(name: string): void {
    const service = this.#kernelServicesByName.get(name);
    if (!service) {
      return;
    }
    this.#kernelServicesByName.delete(name);
    this.#kernelServicesByObject.delete(service.kref);
    this.#kernelStore.unpinObject(service.kref);
    this.#kernelStore.deleteKernelServiceKref(name);
  }

  /**
   * Get a kernel service by name.
   *
   * @param name - The name of the service.
   * @returns The kernel service or undefined if not found.
   */
  getKernelService(name: string): KernelService | undefined {
    return this.#kernelServicesByName.get(name);
  }

  /**
   * Get a kernel service by its kref.
   *
   * @param kref - The kref of the service.
   * @returns The kernel service or undefined if not found.
   */
  getKernelServiceByKref(kref: KRef): KernelService | undefined {
    return this.#kernelServicesByObject.get(kref);
  }

  /**
   * Check if a kref refers to a kernel service.
   *
   * @param kref - The kref to check.
   * @returns True if the kref refers to a kernel service, false otherwise.
   */
  isKernelService(kref: KRef): boolean {
    return this.#kernelServicesByObject.has(kref);
  }

  /**
   * Invoke a kernel service.
   *
   * This method does NOT await the service method result. Instead, it uses
   * promise chaining to resolve the kernel promise when the method eventually
   * completes. This allows service methods to use `waitForCrank()` without
   * causing deadlock - the crank can complete, and the resolution happens
   * in a future turn of the event loop.
   *
   * @param target - The target kref of the service.
   * @param message - The message to invoke the service with.
   */
  invokeKernelService(target: KRef, message: KernelMessage): void {
    const kernelService = this.#kernelServicesByObject.get(target);
    if (!kernelService) {
      throw Error(`No registered service for ${target}`);
    }
    const { methargs, result } = message;
    const [method, args] = kunser(methargs) as [string, unknown[]];
    assert.typeof(method, 'string');
    assert(Array.isArray(args));

    // Use E() so this works for both local objects and remote presences
    // (CapTP proxies whose methods aren't enumerable).
    // Call the method without awaiting. This allows the crank to complete
    // even if the method internally waits for the crank to end.
    try {
      const service = kernelService.service as Record<
        string,
        (...methodArgs: unknown[]) => unknown
      >;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const resultPromise = E(service)[method]!(...args);
      Promise.resolve(resultPromise)
        .then((resultValue) => {
          if (result) {
            this.#kernelQueue.resolvePromises('kernel', [
              [result, false, kser(resultValue)],
            ]);
          }
          return undefined;
        })
        .catch((problem: unknown) => {
          if (result) {
            const detail =
              problem instanceof Error ? problem.message : String(problem);
            this.#kernelQueue.resolvePromises('kernel', [
              [result, true, makeKernelError('DELIVERY_FAILED', detail)],
            ]);
          } else {
            this.#logger?.error('Error in kernel service method:', problem);
          }
        });
    } catch (syncError) {
      // Handle synchronous errors thrown before returning a Promise
      if (result) {
        const detail =
          syncError instanceof Error ? syncError.message : String(syncError);
        this.#kernelQueue.resolvePromises('kernel', [
          [result, true, makeKernelError('DELIVERY_FAILED', detail)],
        ]);
      } else {
        this.#logger?.error('Error in kernel service method:', syncError);
      }
    }
  }
}
