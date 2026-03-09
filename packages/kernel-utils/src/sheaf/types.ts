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
 * A presheaf section: a section (F_sem) paired with optional metadata (F_op).
 *
 * This is the input data to sheafify — an (exo, metadata) pair assigned over
 * the open set defined by the exo's guard.
 */
export type PresheafSection<MetaData = unknown> = {
  exo: Section;
  metadata?: MetaData;
};

/**
 * Context passed to the lift alongside the stalk.
 *
 * `constraints` holds metadata keys whose values are identical across every
 * germ in the stalk — these are topologically determined and not a choice.
 * Typed as `Partial<MetaData>` because the actual partition is runtime-dependent.
 */
export type LiftContext<MetaData = unknown> = {
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
export type Lift<MetaData = unknown> = (
  germs: PresheafSection<Partial<MetaData>>[],
  context: LiftContext<MetaData>,
) => Promise<number>;

/**
 * A presheaf: a plain array of presheaf sections.
 */
export type Presheaf<MetaData = unknown> = PresheafSection<MetaData>[];

/**
 * A sheaf: an authority manager over a presheaf.
 *
 * Produces revocable dispatch sections via `getSection` and tracks all
 * granted authority for auditing and revocation.
 */
export type Sheaf<MetaData = unknown> = {
  /** Produce a revocable dispatch exo over the given guard (or the full union). */
  getSection: (opts: {
    guard?: InterfaceGuard;
    lift: Lift<MetaData>;
  }) => object;
  /** Revoke every granted section whose guard covers the point (method, ...args). */
  revokePoint: (method: string, ...args: unknown[]) => void;
  /** Union guard of all active (non-revoked) granted sections, or undefined. */
  getExported: () => InterfaceGuard | undefined;
  /** Revoke all granted sections. */
  revokeAll: () => void;
};
