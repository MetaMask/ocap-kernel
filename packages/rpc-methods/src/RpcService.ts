import type { Struct } from '@metamask/superstruct';
import { assert as assertStruct } from '@metamask/superstruct';
import { hasProperty } from '@metamask/utils';
import type { Json, JsonRpcParams } from '@metamask/utils';

export type HandlerFunction<
  Hooks extends Record<string, unknown>,
  Params extends JsonRpcParams,
  Result extends Json,
> = (hooks: Hooks, params: Params) => Result;

export type Handler<
  Hooks extends Record<string, unknown>,
  Method extends string,
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  method: Method;
  implementation: HandlerFunction<Hooks, Params, Result>;
  hooks: readonly (keyof Hooks)[];
  params: Struct<Params>;
};

type HandlerRecord<
  Hooks extends Record<string, unknown>,
  Methods extends string,
  Params extends JsonRpcParams,
  Result extends Json,
> = {
  [K in Methods]: Handler<Hooks, K, Params, Result>;
};

type ExtractHooks<
  Handlers extends HandlerRecord<
    Record<string, unknown>,
    string,
    JsonRpcParams,
    Json
  >,
> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Handlers extends Record<string, Handler<infer Hooks, string, any, Json>>
    ? Hooks
    : never;

type ExtractMethods<
  Handlers extends HandlerRecord<
    Record<string, unknown>,
    string,
    JsonRpcParams,
    Json
  >,
> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Handlers extends Record<infer Methods, Handler<any, infer Methods, any, Json>>
    ? Methods
    : never;

/**
 * A registry for RPC method handlers that provides type-safe registration and execution.
 *
 * **ATTN:** Due to the use of `any` for the generic constraits of this class,
 * the internal type safety of this class can be very poor. Exercise caution when
 * modifying it.
 */
export class RpcService<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Handlers extends HandlerRecord<any, string, any, Json>,
> {
  readonly #handlers: Handlers;

  readonly #hooks: ExtractHooks<Handlers>;

  /**
   * Create a new HandlerRegistry with the specified method handlers.
   *
   * @param handlers - A record mapping method names to their handler implementations.
   * @param hooks - The hooks to pass to the method implementation.
   */
  constructor(handlers: Handlers, hooks: ExtractHooks<Handlers>) {
    this.#handlers = handlers;
    this.#hooks = hooks;
  }

  /**
   * Assert that a method is registered in this registry.
   *
   * @param method - The method name to check.
   * @throws If the method is not registered.
   */
  assertHasMethod(method: string): asserts method is ExtractMethods<Handlers> {
    if (!this.#hasMethod(method as ExtractMethods<Handlers>)) {
      throw new Error(`Method "${String(method)}" not found in registry.`);
    }
  }

  /**
   * Execute a method with the provided parameters. Only the hooks specified in the
   * handler's `hooks` array will be passed to the implementation.
   *
   * **ATTN:** Due to the use of `any` for the generic constraits of this class,
   * the internal type safety of this method is very poor. Exercise caution when
   * modifying it.
   *
   * @param method - The method name to execute.
   * @param params - The parameters to pass to the method implementation.
   * @returns The result of the method execution.
   * @throws If the parameters are invalid.
   */
  execute<Method extends ExtractMethods<Handlers>>(
    method: Method,
    params: unknown,
  ): ReturnType<Handlers[Method]['implementation']> {
    const handler = this.#getHandler(method);
    assertParams(params, handler.params);

    // Select only the hooks that the handler needs
    const selectedHooks = selectHooks(this.#hooks, handler.hooks);

    // Execute the handler with the selected hooks
    return handler.implementation(selectedHooks, params) as ReturnType<
      Handlers[Method]['implementation']
    >;
  }

  /**
   * Check if a method is registered in this registry.
   *
   * @param method - The method name to check.
   * @returns Whether the method is registered.
   */
  #hasMethod<Method extends ExtractMethods<Handlers>>(method: Method): boolean {
    return hasProperty(this.#handlers, method);
  }

  /**
   * Get a handler for a specific method.
   *
   * @param method - The method name to get the handler for.
   * @returns The handler for the specified method.
   * @throws If the method is not registered.
   */
  #getHandler<Method extends ExtractMethods<Handlers>>(
    method: Method,
  ): Handlers[Method] {
    return this.#handlers[method];
  }
}

/**
 * @param params - The parameters to assert.
 * @param struct - The struct to assert the parameters against.
 * @throws If the parameters are invalid.
 */
function assertParams<Params extends JsonRpcParams>(
  params: unknown,
  struct: Struct<Params>,
): asserts params is Params {
  try {
    assertStruct(params, struct);
  } catch (error) {
    throw new Error(`Invalid params: ${(error as Error).message}`);
  }
}

/**
 * Returns the subset of the specified `hooks` that are included in the
 * `hookNames` array. This is a Principle of Least Authority (POLA) measure
 * to ensure that each RPC method implementation only has access to the
 * API "hooks" it needs to do its job.
 *
 * @param hooks - The hooks to select from.
 * @param hookNames - The names of the hooks to select.
 * @returns The selected hooks.
 * @template Hooks - The hooks to select from.
 * @template HookName - The names of the hooks to select.
 */
function selectHooks<
  Hooks extends Record<string, unknown>,
  HookName extends keyof Hooks,
>(hooks: Hooks, hookNames: readonly HookName[]): Pick<Hooks, HookName> {
  return hookNames.reduce<Partial<Pick<Hooks, HookName>>>(
    (hookSubset, hookName) => {
      hookSubset[hookName] = hooks[hookName];
      return hookSubset;
    },
    {},
  ) as Pick<Hooks, HookName>;
}

/**
 * Example usage of HandlerRegistry (for documentation purposes only)
 *
 * @example
 * // Define your hooks type
 * type MyHooks = {
 *   logger: { log: (message: string) => void };
 *   storage: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
 * };
 *
 * // Define parameter and result types for your methods
 * type GetBalanceParams = { address: string };
 * type GetBalanceResult = { balance: string };
 *
 * type SendTransactionParams = { from: string; to: string; value: string };
 * type SendTransactionResult = { txHash: string };
 *
 * // Create handlers using the Handler type
 * const getBalanceHandler: Handler<
 *   'eth_getBalance',
 *   MyHooks,
 *   GetBalanceParams,
 *   GetBalanceResult
 * > = {
 *   method: 'eth_getBalance',
 *   implementation: (hooks, params) => {
 *     hooks.logger.log(`Getting balance for ${params.address}`);
 *     // Implementation logic here
 *     return { balance: '0x0' };
 *   },
 *   hooks: ['logger'],
 *   params: object({ address: string() }),
 *   result: object({ balance: string() }),
 * };
 *
 * const sendTransactionHandler: Handler<
 *   'eth_sendTransaction',
 *   MyHooks,
 *   SendTransactionParams,
 *   SendTransactionResult
 * > = {
 *   method: 'eth_sendTransaction',
 *   implementation: (hooks, params) => {
 *     hooks.logger.log(`Sending transaction from ${params.from} to ${params.to}`);
 *     // Implementation logic here
 *     return { txHash: '0x123' };
 *   },
 *   hooks: ['logger', 'storage'],
 *   params: object({ from: string(), to: string(), value: string() }),
 *   result: object({ txHash: string() }),
 * };
 *
 * // Create a registry with your handlers
 * const registry = new HandlerRegistry<
 *   MyHooks,
 *   {
 *     'eth_getBalance': typeof getBalanceHandler;
 *     'eth_sendTransaction': typeof sendTransactionHandler;
 *   }
 * >({
 *   'eth_getBalance': getBalanceHandler,
 *   'eth_sendTransaction': sendTransactionHandler,
 * });
 *
 * // Now you can use the registry in a type-safe way
 * const hooks: MyHooks = {
 *   logger: { log: (message) => console.log(message) },
 *   storage: {
 *     get: async (key) => null,
 *     set: async (key, value) => {}
 *   }
 * };
 *
 * // Type-safe method execution
 * const balanceResult = registry.execute(
 *   'eth_getBalance',
 *   hooks,
 *   { address: '0x123' }
 * );
 * // balanceResult is typed as { balance: string }
 * // Note: Only the 'logger' hook will be passed to the implementation
 *
 * const txResult = registry.execute(
 *   'eth_sendTransaction',
 *   hooks,
 *   { from: '0x123', to: '0x456', value: '0x1' }
 * );
 * // txResult is typed as { txHash: string }
 * // Note: Both 'logger' and 'storage' hooks will be passed to the implementation
 *
 * // The following would cause TypeScript errors:
 * // - Wrong method name: registry.execute('unknown_method', hooks, {})
 * // - Wrong parameter type: registry.execute('eth_getBalance', hooks, { wrong: 'param' })
 * // - Accessing wrong result property: balanceResult.wrongProperty
 */
