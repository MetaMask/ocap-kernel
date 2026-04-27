/**
 * Sheaf types: the product decomposition F_sem x F_op.
 *
 * The section (guard + behavior) is the semantic component F_sem.
 * The metadata is the operational component F_op.
 * Effect-equivalence (the sheaf condition) is asserted by the interface:
 * sections covering the same open set produce the same observable result.
 */

import type { GET_INTERFACE_GUARD, Methods } from '@endo/exo';
import type { InterfaceGuard } from '@endo/patterns';

import type { MethodSchema } from '../schema.ts';

/** A section: a capability covering a region of the interface topology. */
export type Section<Core extends Methods = Methods> = Partial<Core> & {
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
 * A presheaf section: a section (F_sem) paired with an optional metadata spec (F_op).
 *
 * This is the input data to sheafify — an (exo, metadata) pair assigned over
 * the open set defined by the exo's guard.
 */
export type PresheafSection<MetaData extends Record<string, unknown>> = {
  exo: Section;
  metadata?: MetadataSpec<MetaData>;
};

/**
 * A section with evaluated metadata: the metadata spec has been computed against
 * the invocation args, yielding a concrete plain object. Used internally during dispatch
 * and as the element type of the `germs` array received by Lift (where each entry
 * is already a representative of an equivalence class after collapsing).
 * Empty `{}` means no metadata.
 */
export type EvaluatedSection<MetaData extends Record<string, unknown>> = {
  exo: Section;
  metadata: MetaData;
};

/**
 * Context passed to the lift alongside the stalk.
 *
 * `constraints` holds metadata keys whose values are identical across every
 * germ in the stalk — these are topologically determined and not a choice.
 * Typed as `Partial<MetaData>` because the actual partition is runtime-dependent.
 */
export type LiftContext<MetaData extends Record<string, unknown>> = {
  method: string;
  args: unknown[];
  constraints: Partial<MetaData>;
};

/**
 * Lift: a coroutine that yields candidates in preference order and receives
 * the accumulated error list after each failed attempt.
 *
 * Each germ carries only distinguishing metadata (options); shared metadata
 * (constraints) is delivered separately in the context.
 *
 * The sheaf calls gen.next([]) to prime the coroutine, then gen.next(errors)
 * after each failure, where errors is the ordered list of every error
 * encountered so far. The generator can inspect the history to decide whether
 * to yield another candidate or return (signal exhaustion). The sheaf
 * rethrows the last error when the generator is done.
 *
 * Simple lifts that do not need retry logic can ignore the error input:
 *   async function*(germs) { yield* [...germs].sort(comparator); }
 */
export type Lift<MetaData extends Record<string, unknown>> = (
  germs: EvaluatedSection<Partial<MetaData>>[],
  context: LiftContext<MetaData>,
) => AsyncGenerator<EvaluatedSection<Partial<MetaData>>, void, unknown[]>;

/**
 * A presheaf: a plain array of presheaf sections.
 */
export type Presheaf<MetaData extends Record<string, unknown>> =
  PresheafSection<MetaData>[];

/**
 * A sheaf: an authority manager over a presheaf.
 *
 * Produces revocable dispatch sections via `getSection` and tracks all
 * granted authority for auditing and revocation.
 */
export type Sheaf<MetaData extends Record<string, unknown>> = {
  /** Produce a revocable dispatch exo over the given guard. */
  getSection: (opts: { guard: InterfaceGuard; lift: Lift<MetaData> }) => object;
  /** Produce a revocable discoverable dispatch exo over the given guard. */
  getDiscoverableSection: (opts: {
    guard: InterfaceGuard;
    lift: Lift<MetaData>;
    schema: Record<string, MethodSchema>;
  }) => object;
  /**
   * Produce a revocable dispatch exo over the full union guard of all presheaf sections.
   *
   * @deprecated Provide an explicit guard via getSection instead.
   */
  getGlobalSection: (opts: { lift: Lift<MetaData> }) => object;
  /**
   * Produce a revocable discoverable dispatch exo over the full union guard of all presheaf sections.
   *
   * @deprecated Provide an explicit guard via getDiscoverableSection instead.
   */
  getDiscoverableGlobalSection: (opts: {
    lift: Lift<MetaData>;
    schema: Record<string, MethodSchema>;
  }) => object;
};
