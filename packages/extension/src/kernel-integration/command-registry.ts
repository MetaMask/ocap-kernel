import { assert } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

import type {
  KernelCommandPayloadStructs,
  KernelControlMethod,
} from './messages.js';

type KernelMethods = keyof typeof KernelControlMethod;

export type CommandParams = {
  [Method in KernelMethods]: Infer<
    (typeof KernelCommandPayloadStructs)[Method]
  >['params'];
};

export type CommandHandler<Method extends KernelMethods> = {
  /**
   * Validation schema for the parameters.
   */
  schema: Struct<CommandParams[Method]>;

  /**
   * Execute the command.
   *
   * @param kernel - The kernel instance.
   * @param kvStore - The KV store instance.
   * @param params - The parameters.
   * @returns The result of the command.
   */
  execute: (
    kernel: Kernel,
    kvStore: KVStore,
    params: CommandParams[Method],
  ) => Promise<Json>;
};

export type Middleware = (
  next: (kernel: Kernel, kvStore: KVStore, params: unknown) => Promise<Json>,
) => (kernel: Kernel, kvStore: KVStore, params: unknown) => Promise<Json>;

/**
 * A registry for kernel commands.
 */
export class KernelCommandRegistry {
  readonly #handlers = new Map<KernelMethods, CommandHandler<KernelMethods>>();

  readonly #middlewares: Middleware[] = [];

  /**
   * Register a command handler.
   *
   * @param method - The method name.
   * @param handler - The command handler.
   */
  register<Method extends KernelMethods>(
    method: Method,
    handler: CommandHandler<Method>,
  ): void {
    this.#handlers.set(
      method,
      handler as unknown as CommandHandler<KernelMethods>,
    );
  }

  /**
   * Register a middleware.
   *
   * @param middleware - The middleware.
   */
  use(middleware: Middleware): void {
    this.#middlewares.push(middleware);
  }

  /**
   * Execute a command.
   *
   * @param kernel - The kernel.
   * @param kvStore - The KV store.
   * @param method - The method name.
   * @param params - The parameters.
   * @returns The result.
   */
  async execute<Method extends KernelMethods>(
    kernel: Kernel,
    kvStore: KVStore,
    method: Method,
    params: CommandParams[Method],
  ): Promise<Json> {
    const handler = this.#handlers.get(method);
    if (!handler) {
      throw new Error(`Unknown method: ${method}`);
    }

    let chain = async (
      k: Kernel,
      kv: KVStore,
      param: unknown,
    ): Promise<Json> => {
      assert(param, handler.schema);
      return handler.execute(k, kv, param);
    };

    // Apply middlewares in reverse order
    for (const middleware of [...this.#middlewares].reverse()) {
      chain = middleware(chain);
    }

    return chain(kernel, kvStore, params);
  }
}
