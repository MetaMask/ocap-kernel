/**
 * MetadataSpec constructors and evaluation helpers.
 */

import type { MetadataSpec } from './types.ts';

/** Resolved spec: 'source' has been compiled away; only constant or callable remain. */
export type ResolvedMetadataSpec<M extends Record<string, unknown>> =
  | { kind: 'constant'; value: M }
  | { kind: 'callable'; fn: (args: unknown[]) => M };

const metadataPlainObjectHint =
  'Sheaf metadata must be a plain object; use e.g. { value: myValue } if you need to attach a primitive.';

const isPlainObjectRecord = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
};

/**
 * Normalize evaluated metadata: empty sentinel is `{}`; invalid shapes throw.
 *
 * @param raw - Result from constant value or callable, before validation.
 * @returns A plain object suitable for stalk metadata.
 */
const normalizeEvaluatedSheafMetadata = (
  raw: unknown,
): Record<string, unknown> => {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== 'object') {
    throw new Error(
      `sheafify: metadata cannot be a primitive (${typeof raw}). ${metadataPlainObjectHint}`,
    );
  }
  if (Array.isArray(raw)) {
    throw new Error(
      `sheafify: metadata cannot be an array. ${metadataPlainObjectHint}`,
    );
  }
  if (!isPlainObjectRecord(raw)) {
    throw new Error(
      `sheafify: metadata must be a plain object. ${metadataPlainObjectHint}`,
    );
  }
  return raw as Record<string, unknown>;
};

/**
 * Wrap a static value as a constant metadata spec.
 *
 * @param value - The static metadata value.
 * @returns A constant MetadataSpec wrapping the value.
 */
export const constant = <M extends Record<string, unknown>>(
  value: M,
): MetadataSpec<M> => harden({ kind: 'constant', value });

/**
 * Wrap JS function source. Evaluated in a Compartment at sheafify construction time.
 *
 * Prefer `callable` unless the metadata function must be supplied as a
 * serializable source string — for example, when crossing a trust boundary or
 * deserializing from storage. Requires a `compartment` passed to `sheafify`.
 *
 * @param src - JS source string of the form `(args) => M`.
 * @returns A source MetadataSpec wrapping the source string.
 */
export const source = <M extends Record<string, unknown>>(
  src: string,
): MetadataSpec<M> => harden({ kind: 'source', src });

/**
 * Wrap a live function as a callable metadata spec.
 *
 * @param fn - Function from invocation args to metadata value.
 * @returns A callable metadata spec.
 */
export const callable = <M extends Record<string, unknown>>(
  fn: (args: unknown[]) => M,
): MetadataSpec<M> => harden({ kind: 'callable', fn });

/**
 * Compile a 'source' spec to 'callable' using the supplied compartment.
 * 'constant' and 'callable' pass through unchanged.
 *
 * @param spec - The MetadataSpec to resolve.
 * @param compartment - Compartment used to evaluate 'source' specs. Required when spec is 'source'.
 * @param compartment.evaluate - Evaluate a JS source string and return the result.
 * @returns A ResolvedMetadataSpec with no 'source' variant.
 */
export const resolveMetadataSpec = <M extends Record<string, unknown>>(
  spec: MetadataSpec<M>,
  compartment?: { evaluate: (src: string) => unknown },
): ResolvedMetadataSpec<M> => {
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
 *
 * Missing spec yields `{}` (no metadata). Callable/constant results must be plain objects;
 * `undefined`/`null` from the producer normalize to `{}`. Primitives, arrays, and non-plain
 * objects throw with guidance to use an explicit record such as `{ value: myValue }`.
 *
 * @param spec - The resolved spec to evaluate, or undefined.
 * @param args - The invocation arguments.
 * @returns The evaluated metadata object (possibly empty).
 */
export const evaluateMetadata = <MetaData extends Record<string, unknown>>(
  spec: ResolvedMetadataSpec<MetaData> | undefined,
  args: unknown[],
): MetaData => {
  if (spec === undefined) {
    return {} as MetaData;
  }
  const raw = spec.kind === 'constant' ? spec.value : spec.fn(args);
  return normalizeEvaluatedSheafMetadata(raw) as MetaData;
};
