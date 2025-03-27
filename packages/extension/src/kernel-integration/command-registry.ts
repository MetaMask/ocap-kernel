import { assert } from '@metamask/superstruct';
import type { Infer, Struct } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { Kernel } from '@ocap/kernel';
import type { KernelDatabase } from '@ocap/store';

import type { KernelControlMethod } from './handlers/index.ts';
import type { KernelCommandPayloadStructs } from './messages.ts';

export type CommandParams = {
  [Method in KernelControlMethod]: Infer<
    (typeof KernelCommandPayloadStructs)[Method]
  >['params'];
};

export type CommandHandler<Method extends KernelControlMethod> = {
  method: Method;

  /**
   * Validation schema for the parameters.
   */
  schema: Struct<CommandParams[Method]>;

  /**
   * Implementation of the command.
   *
   * @param kernel - The kernel instance.
   * @param kernelDatabase - The kernel database instance.
   * @param params - The parameters.
   * @returns The result of the command.
   */
  implementation: (
    kernel: Kernel,
    kernelDatabase: KernelDatabase,
    params: CommandParams[Method],
  ) => Promise<Json>;
};

/**
 * A registry for kernel commands.
 */
export class KernelCommandRegistry {
  readonly #handlers = new Map<
    KernelControlMethod,
    CommandHandler<KernelControlMethod>
  >();

  /**
   * Register a command handler.
   *
   * @param handler - The command handler.
   */
  register<Method extends KernelControlMethod>(
    handler: CommandHandler<Method>,
  ): void;

  register(handler: CommandHandler<KernelControlMethod>): void {
    this.#handlers.set(handler.method, handler);
  }

  /**
   * Execute a command.
   *
   * @param kernel - The kernel.
   * @param kernelDatabase - The kernel database.
   * @param method - The method name.
   * @param params - The parameters.
   * @returns The result.
   */
  async execute<Method extends KernelControlMethod>(
    kernel: Kernel,
    kernelDatabase: KernelDatabase,
    method: Method,
    params: CommandParams[Method],
  ): Promise<Json> {
    const handler = this.#handlers.get(method);
    if (!handler) {
      throw new Error(`Unknown method: ${method}`);
    }

    assert(params, handler.schema);
    return handler.implementation(kernel, kernelDatabase, params);
  }
}
