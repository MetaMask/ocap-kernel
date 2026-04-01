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
export type MetaDataSpec<M extends Record<string, unknown>> =
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
  metadata?: MetaDataSpec<MetaData>;
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
 * Lift: selects one germ from the stalk when multiple germs remain after
 * collapsing equivalent presheaf sections.
 *
 * Each germ carries only distinguishing metadata (options); shared metadata
 * (constraints) is delivered separately in the context.
 *
 * Returns a Promise<number> — the index into the germs array.
 */
export type Lift<MetaData extends Record<string, unknown>> = (
  germs: EvaluatedSection<Partial<MetaData>>[],
  context: LiftContext<MetaData>,
) => Promise<number>;

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
  /** Produce a revocable dispatch exo over the full union guard of all presheaf sections. */
  getGlobalSection: (opts: { lift: Lift<MetaData> }) => object;
  /** Revoke every granted section whose guard covers the point (method, ...args). */
  revokePoint: (method: string, ...args: unknown[]) => void;
  /** Union guard of all active (non-revoked) granted sections, or undefined. */
  getExported: () => InterfaceGuard | undefined;
  /** Revoke all granted sections. */
  revokeAll: () => void;
};
