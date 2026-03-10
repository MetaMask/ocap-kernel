/**
 * MetaDataSpec constructors and evaluation helpers.
 */

import type { MetaDataSpec } from './types.ts';

/** Resolved spec: 'source' has been compiled away; only constant or callable remain. */
export type ResolvedMetaDataSpec<M> =
  | { kind: 'constant'; value: M }
  | { kind: 'callable'; fn: (args: unknown[]) => M };

/**
 * Wrap a static value as a constant metadata spec.
 *
 * @param value - The static metadata value.
 * @returns A constant MetaDataSpec wrapping the value.
 */
export const constant = <M>(value: M): MetaDataSpec<M> =>
  harden({ kind: 'constant', value });

/**
 * Wrap JS function source. Evaluated in a Compartment at sheafify construction time.
 *
 * @param src - JS source string of the form `(args) => M`.
 * @returns A source MetaDataSpec wrapping the source string.
 */
export const source = <M>(src: string): MetaDataSpec<M> =>
  harden({ kind: 'source', src });

/**
 * Wrap a live function as a callable metadata spec.
 *
 * @param fn - Function from invocation args to metadata value.
 * @returns A callable MetaDataSpec wrapping the function.
 */
export const callable = <M>(fn: (args: unknown[]) => M): MetaDataSpec<M> =>
  harden({ kind: 'callable', fn });

/**
 * Compile a 'source' spec to 'callable' using the supplied compartment.
 * 'constant' and 'callable' pass through unchanged.
 *
 * @param spec - The MetaDataSpec to resolve.
 * @param compartment - Compartment used to evaluate 'source' specs. Required when spec is 'source'.
 * @param compartment.evaluate - Evaluate a JS source string and return the result.
 * @returns A ResolvedMetaDataSpec with no 'source' variant.
 */
export const resolveMetaDataSpec = <M>(
  spec: MetaDataSpec<M>,
  compartment?: { evaluate: (src: string) => unknown },
): ResolvedMetaDataSpec<M> => {
  if (spec.kind === 'source') {
    if (!compartment) {
      throw new Error(
        `sheafify: compartment required to evaluate 'source' metadata`,
      );
    }
    return {
      kind: 'callable',
      fn: compartment.evaluate(spec.src) as (args: unknown[]) => M,
    };
  }
  return spec;
};

/**
 * Evaluate a resolved metadata spec against the invocation args.
 * Returns undefined if spec is undefined (no metadata on the section).
 *
 * @param spec - The resolved spec to evaluate, or undefined.
 * @param args - The invocation arguments.
 * @returns The evaluated metadata value, or undefined.
 */
export const evaluateMetadata = <M>(
  spec: ResolvedMetaDataSpec<M> | undefined,
  args: unknown[],
): M | undefined => {
  if (spec === undefined) {
    return undefined;
  }
  if (spec.kind === 'constant') {
    return spec.value;
  }
  return spec.fn(args);
};
