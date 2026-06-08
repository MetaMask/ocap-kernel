/**
 * MetadataSpec constructors and evaluation helpers.
 */

import type { MetadataSpec } from './types.ts';

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
 * @returns A plain object suitable for candidate metadata.
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
 * Wrap a live function as a callable metadata spec.
 *
 * @param fn - Function from invocation args to metadata value.
 * @returns A callable metadata spec.
 */
export const callable = <M extends Record<string, unknown>>(
  fn: (args: unknown[]) => M,
): MetadataSpec<M> => harden({ kind: 'callable', fn });

/**
 * Evaluate a metadata spec against the invocation args.
 *
 * Missing spec yields `{}` (no metadata). Callable/constant results must be plain objects;
 * `undefined`/`null` from the producer normalize to `{}`. Primitives, arrays, and non-plain
 * objects throw with guidance to use an explicit record such as `{ value: myValue }`.
 *
 * @param spec - The spec to evaluate, or undefined.
 * @param args - The invocation arguments.
 * @returns The evaluated metadata object (possibly empty).
 */
export const evaluateMetadata = <MetaData extends Record<string, unknown>>(
  spec: MetadataSpec<MetaData> | undefined,
  args: unknown[],
): MetaData => {
  if (spec === undefined) {
    return {} as MetaData;
  }
  const raw = spec.kind === 'constant' ? spec.value : spec.fn(args);
  return normalizeEvaluatedSheafMetadata(raw) as MetaData;
};
