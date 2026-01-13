import type { Logger } from '@metamask/logger';

import type { KernelQueue } from './KernelQueue.ts';
import { kser, kunser } from './liveslots/kernel-marshal.ts';
import type { KernelStore } from './store/index.ts';
import type { KRef, Message } from './types.ts';
import { assert } from './utils/assert.ts';

export type KernelService = {
  name: string;
  kref: string;
  service: object;
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
  readonly #kernelServicesByObject: Map<string, KernelService> = new Map();

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
   * @returns The registered kernel service with its kref.
   */
  registerKernelServiceObject(name: string, service: object): KernelService {
    const serviceKey = `kernelService.${name}`;
    let kref = this.#kernelStore.kv.get(serviceKey);
    if (!kref) {
      kref = this.#kernelStore.initKernelObject('kernel');
      this.#kernelStore.kv.set(serviceKey, kref);
      this.#kernelStore.pinObject(kref);
    }
    const kernelService = { name, kref, service };
    this.#kernelServicesByName.set(name, kernelService);
    this.#kernelServicesByObject.set(kref, kernelService);
    return kernelService;
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
  getKernelServiceByKref(kref: string): KernelService | undefined {
    return this.#kernelServicesByObject.get(kref);
  }

  /**
   * Check if a kref refers to a kernel service.
   *
   * @param kref - The kref to check.
   * @returns True if the kref refers to a kernel service, false otherwise.
   */
  isKernelService(kref: string): boolean {
    return this.#kernelServicesByObject.has(kref);
  }

  /**
   * Invoke a kernel service.
   *
   * @param target - The target kref of the service.
   * @param message - The message to invoke the service with.
   */
  async invokeKernelService(target: KRef, message: Message): Promise<void> {
    const kernelService = this.#kernelServicesByObject.get(target);
    if (!kernelService) {
      throw Error(`No registered service for ${target}`);
    }
    const { methargs, result } = message;
    const [method, args] = kunser(methargs) as [string, unknown[]];
    assert.typeof(method, 'string');
    if (result) {
      assert.typeof(result, 'string');
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const service = kernelService.service as Record<string, Function>;
    const methodFunction = service[method];
    if (methodFunction === undefined) {
      if (result) {
        this.#kernelQueue.resolvePromises('kernel', [
          [result, true, kser(Error(`unknown service method '${method}'`))],
        ]);
      } else {
        this.#logger?.error(`unknown service method '${method}'`);
      }
      return;
    }
    assert.typeof(methodFunction, 'function');
    assert(Array.isArray(args));
    try {
      const resultValue = await methodFunction.apply(service, args);
      if (result) {
        this.#kernelQueue.resolvePromises('kernel', [
          [result, false, kser(resultValue)],
        ]);
      }
    } catch (problem) {
      if (result) {
        this.#kernelQueue.resolvePromises('kernel', [
          [result, true, kser(problem)],
        ]);
      } else {
        this.#logger?.error('Error in kernel service method:', problem);
      }
    }
  }
}
