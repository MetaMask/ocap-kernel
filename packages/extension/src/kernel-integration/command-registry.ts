import type { Json } from '@metamask/utils';
import type { Kernel, KVStore } from '@ocap/kernel';

export type CommandHandler = {
  /**
   * Validate the parameters.
   *
   * @param params - The parameters.
   * @returns Whether the parameters are valid.
   */
  validate: (params: unknown) => boolean;

  /**
   * Execute the command.
   *
   * @param kernel - The kernel instance.
   * @param kvStore - The KV store instance.
   * @param params - The parameters.
   * @returns The result of the command.
   */
  execute: (kernel: Kernel, kvStore: KVStore, params: unknown) => Promise<Json>;
};

export type Middleware = (
  next: (kernel: Kernel, kvStore: KVStore, params: unknown) => Promise<Json>,
) => (kernel: Kernel, kvStore: KVStore, params: unknown) => Promise<Json>;

/**
 * A registry for kernel commands.
 */
export class KernelCommandRegistry {
  readonly #handlers = new Map<string, CommandHandler>();

  readonly #middlewares: Middleware[] = [];

  /**
   * Register a command handler.
   *
   * @param method - The method name.
   * @param handler - The command handler.
   */
  register(method: string, handler: CommandHandler): void {
    this.#handlers.set(method, handler);
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
  async execute(
    kernel: Kernel,
    kvStore: KVStore,
    method: string,
    params: unknown,
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
      if (!handler.validate(param)) {
        throw new Error('Invalid parameters');
      }
      return handler.execute(k, kv, param);
    };

    // Apply middlewares in reverse order
    for (const middleware of [...this.#middlewares].reverse()) {
      chain = middleware(chain);
    }

    return chain(kernel, kvStore, params);
  }
}
