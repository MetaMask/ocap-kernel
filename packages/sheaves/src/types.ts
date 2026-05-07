/**
 * Sheaf types: the product decomposition F_sem x F_op.
 *
 * The handler (guard + behavior) is the semantic component F_sem.
 * The metadata is the operational component F_op.
 * Effect-equivalence (the sheaf condition) is asserted by the interface:
 * handlers covering the same open set produce the same observable result.
 */

import type { GET_INTERFACE_GUARD, Methods } from '@endo/exo';
import type { InterfaceGuard } from '@endo/patterns';
import type { MethodSchema } from '@metamask/kernel-utils';

/** A handler: a capability covering a region of the interface topology. */
export type Handler<Core extends Methods = Methods> = Partial<Core> & {
  [K in typeof GET_INTERFACE_GUARD]?: (() => InterfaceGuard) | undefined;
};

/**
 * A metadata specification: either a static value, a JS source string, or a
 * live function. Source strings are compiled once at sheafify construction time.
 * Evaluated metadata must be a plain object (`{}` means no metadata; primitives
 * must be wrapped, e.g. `{ value: n }`).
 */
export type MetadataSpec<M extends Record<string, unknown>> =
  | { kind: 'constant'; value: M }
  | { kind: 'source'; src: string }
  | { kind: 'callable'; fn: (args: unknown[]) => M };

/**
 * A provider: a handler (F_sem) paired with an optional metadata spec (F_op).
 *
 * This is the input data to sheafify — a (handler, metadata) pair assigned over
 * the open set defined by the handler's guard.
 */
export type Provider<MetaData extends Record<string, unknown>> = {
  handler: Handler;
  metadata?: MetadataSpec<MetaData>;
};

/**
 * A candidate: a provider with evaluated metadata. The metadata spec has been
 * computed against the invocation args, yielding a concrete plain object. Used
 * internally during dispatch and as the element type of the array received by
 * Policy (where each entry is already a representative of an equivalence class
 * after collapsing). Empty `{}` means no metadata.
 */
export type Candidate<MetaData extends Record<string, unknown>> = {
  handler: Handler;
  metadata: MetaData;
};

/**
 * Context passed to the policy alongside the candidates.
 *
 * `constraints` holds metadata keys whose values are identical across every
 * candidate — these are topologically determined and not a choice.
 * Typed as `Partial<MetaData>` because the actual partition is runtime-dependent.
 */
export type PolicyContext<MetaData extends Record<string, unknown>> = {
  method: string;
  args: unknown[];
  constraints: Partial<MetaData>;
};

/**
 * Policy: a coroutine that yields candidates in preference order and receives
 * the accumulated error list after each failed attempt.
 *
 * Each candidate carries only distinguishing metadata (options); shared metadata
 * (constraints) is delivered separately in the context.
 *
 * The sheaf calls gen.next([]) to prime the coroutine, then gen.next(errors)
 * after each failure, where errors is the ordered list of every error
 * encountered so far. The generator can inspect the history to decide whether
 * to yield another candidate or return (signal exhaustion). The sheaf
 * rethrows the last error when the generator is done.
 *
 * Simple policies that do not need retry logic can ignore the error input:
 *   async function*(candidates) { yield* [...candidates].sort(comparator); }
 */
export type Policy<MetaData extends Record<string, unknown>> = (
  candidates: Candidate<Partial<MetaData>>[],
  context: PolicyContext<MetaData>,
) => AsyncGenerator<Candidate<Partial<MetaData>>, void, unknown[]>;

/**
 * A sheaf: an authority manager over a set of providers.
 *
 * Produces dispatch sections via `getSection`, each routing invocations
 * through the providers supplied at construction time.
 */
export type Sheaf<MetaData extends Record<string, unknown>> = {
  /**
   * Produce a dispatch exo over the given guard.
   *
   * Returns `object` rather than a typed exo because the guard is passed
   * dynamically at call time — TypeScript cannot propagate the method
   * signatures through `Sheaf<M>` without knowing the specific guard.
   * Cast to the interface type at the call site once you know the guard.
   */
  getSection: (opts: {
    guard: InterfaceGuard;
    lift: Policy<MetaData>;
  }) => object;
  /**
   * Produce a discoverable dispatch exo over the given guard.
   *
   * Returns `object` for the same reason as `getSection`.
   */
  getDiscoverableSection: (opts: {
    guard: InterfaceGuard;
    lift: Policy<MetaData>;
    schema: Record<string, MethodSchema>;
  }) => object;
  /**
   * Produce a dispatch exo over the full union guard of all providers.
   *
   * Prefer `getSection` with an explicit guard when the guard is statically
   * known — it makes the capability's scope visible at the call site. Use the
   * global variant when providers are assembled dynamically at runtime and the
   * union guard is not known until after `sheafify` runs.
   *
   * @deprecated Provide an explicit guard via getSection instead.
   */
  getGlobalSection: (opts: { lift: Policy<MetaData> }) => object;
  /**
   * Produce a discoverable dispatch exo over the full union guard of all providers.
   *
   * Prefer `getDiscoverableSection` with an explicit guard when the guard is
   * statically known. Use the global variant when providers are assembled
   * dynamically and the union guard is not known until after `sheafify` runs.
   *
   * @deprecated Provide an explicit guard via getDiscoverableSection instead.
   */
  getDiscoverableGlobalSection: (opts: {
    lift: Policy<MetaData>;
    schema: Record<string, MethodSchema>;
  }) => object;
};
