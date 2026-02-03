import type { Logger } from '@metamask/logger';
import type { Json } from '@metamask/utils';

import type { ControllerStorage } from './storage/controller-storage.ts';

/**
 * Base type for controller methods.
 * Controllers expose their public API through a methods object.
 */
export type ControllerMethods = Record<string, (...args: never[]) => unknown>;

/**
 * Configuration passed to all controllers during initialization.
 */
export type ControllerConfig = {
  logger?: Logger | undefined;
};

/**
 * Abstract base class for controllers.
 *
 * Provides state management via ControllerStorage with:
 * - Synchronous state access via `this.state`
 * - Async state updates via `this.update()`
 * - Automatic persistence handled by storage layer
 *
 * Subclasses must:
 * - Call `harden(this)` at the end of their constructor
 *
 * @template ControllerName - Literal string type for the controller name
 * @template State - The state object shape (must be JSON-serializable)
 * @template Methods - The public method interface
 *
 * @example
 * ```typescript
 * class MyController extends Controller<'MyController', MyState, MyMethods> {
 *   private constructor(storage: ControllerStorage<MyState>, logger: Logger) {
 *     super('MyController', storage, logger);
 *     harden(this);
 *   }
 *
 *   static create(config: ControllerConfig, deps: MyDeps): MyMethods {
 *     const controller = new MyController(deps.storage, config.logger);
 *     return controller.makeFacet();
 *   }
 *
 *   makeFacet(): MyMethods {
 *     return makeDefaultExo('MyController', { ... });
 *   }
 * }
 * ```
 */
export abstract class Controller<
  ControllerName extends string,
  State extends Record<string, Json>,
  Methods extends ControllerMethods,
> {
  readonly #name: ControllerName;

  readonly #storage: ControllerStorage<State>;

  readonly #logger: Logger | undefined;

  /**
   * Protected constructor - subclasses must call this via super().
   *
   * @param name - Controller name for debugging/logging.
   * @param storage - ControllerStorage instance for state management.
   * @param logger - Optional logger instance.
   */
  protected constructor(
    name: ControllerName,
    storage: ControllerStorage<State>,
    logger?: Logger,
  ) {
    this.#name = name;
    this.#storage = storage;
    this.#logger = logger;
    // Note: Subclass must call harden(this) after its own initialization
  }

  /**
   * Controller name for debugging/logging.
   *
   * @returns The controller name.
   */
  protected get name(): ControllerName {
    return this.#name;
  }

  /**
   * Current state (readonly).
   * Provides synchronous access to in-memory state.
   *
   * @returns The current readonly state.
   */
  protected get state(): Readonly<State> {
    return this.#storage.state;
  }

  /**
   * Logger instance for this controller.
   *
   * @returns The logger instance, or undefined if not provided.
   */
  protected get logger(): Logger | undefined {
    return this.#logger;
  }

  /**
   * Update state using an immer producer function.
   * State is updated synchronously in memory.
   * Persistence is handled automatically by the storage layer (debounced).
   *
   * @param producer - Function that mutates a draft of the state.
   */
  protected update(producer: (draft: State) => void): void {
    this.#storage.update(producer);
  }

  /**
   * Clear storage and reset to default state.
   */
  clearState(): void {
    this.#storage.clear();
  }

  /**
   * Returns the hardened exo with public methods.
   * Subclasses implement this to define their public interface.
   *
   * @returns A hardened exo object with the controller's public methods.
   */
  abstract makeFacet(): Methods;
}
harden(Controller);
