import { describe, it, expect, vi } from 'vitest';

import {
  callable,
  constant,
  evaluateMetadata,
  resolveMetaDataSpec,
  source,
} from './metadata.ts';

describe('constant', () => {
  it('returns a constant spec with the given value', () => {
    expect(constant({ n: 42 })).toStrictEqual({
      kind: 'constant',
      value: { n: 42 },
    });
  });

  it('evaluateMetadata returns the value regardless of args', () => {
    const spec = resolveMetaDataSpec(constant({ cost: 7 }));
    expect(evaluateMetadata(spec, [])).toStrictEqual({ cost: 7 });
    expect(evaluateMetadata(spec, [1, 2, 3])).toStrictEqual({ cost: 7 });
  });
});

describe('callable', () => {
  it('returns a callable spec wrapping the function', () => {
    const fn = (args: unknown[]) => ({ out: args[0] as number });
    const spec = callable(fn);
    expect(spec).toStrictEqual({ kind: 'callable', fn });
  });

  it('evaluateMetadata calls fn with args', () => {
    const fn = vi.fn((args: unknown[]) => ({
      value: (args[0] as number) * 2,
    }));
    const spec = resolveMetaDataSpec(callable(fn));
    expect(evaluateMetadata(spec, [5])).toStrictEqual({ value: 10 });
    expect(fn).toHaveBeenCalledWith([5]);
  });
});

describe('source', () => {
  it('returns a source spec with the src string', () => {
    expect(source('(args) => ({ x: args[0] })')).toStrictEqual({
      kind: 'source',
      src: '(args) => ({ x: args[0] })',
    });
  });

  it('resolveMetaDataSpec compiles source to callable via compartment', () => {
    const mockFn = (args: unknown[]) => ({ value: args[0] as number });
    const compartment = { evaluate: vi.fn(() => mockFn) };
    const spec = resolveMetaDataSpec(
      source<{ value: number }>('(args) => ({ value: args[0] })'),
      compartment,
    );
    expect(spec.kind).toBe('callable');
    expect(compartment.evaluate).toHaveBeenCalledWith(
      '(args) => ({ value: args[0] })',
    );
    expect(evaluateMetadata(spec, [99])).toStrictEqual({ value: 99 });
  });
});

describe('resolveMetaDataSpec', () => {
  it('passes constant spec through unchanged', () => {
    const spec = constant({ answer: 42 });
    expect(resolveMetaDataSpec(spec)).toStrictEqual(spec);
  });

  it('passes callable spec through unchanged', () => {
    const fn = (_args: unknown[]) => ({ count: 0 });
    const spec = callable(fn);
    expect(resolveMetaDataSpec(spec)).toStrictEqual(spec);
  });

  it("throws if kind is 'source' and no compartment supplied", () => {
    expect(() => resolveMetaDataSpec(source('() => ({})'))).toThrow(
      "compartment required to evaluate 'source' metadata",
    );
  });
});

describe('evaluateMetadata', () => {
  it('returns empty object when spec is undefined', () => {
    expect(evaluateMetadata(undefined, [])).toStrictEqual({});
    expect(evaluateMetadata(undefined, [1, 2])).toStrictEqual({});
  });

  it('normalizes null from callable to empty object', () => {
    const spec = resolveMetaDataSpec(
      callable(
        ((_args: unknown[]) => null) as unknown as (
          args: unknown[],
        ) => Record<string, unknown>,
      ),
    );
    expect(evaluateMetadata(spec, [])).toStrictEqual({});
  });

  it('throws when callable returns a primitive', () => {
    const spec = resolveMetaDataSpec(
      callable(
        ((_args: unknown[]) => 7) as unknown as (
          args: unknown[],
        ) => Record<string, unknown>,
      ),
    );
    expect(() => evaluateMetadata(spec, [])).toThrow(/cannot be a primitive/u);
    expect(() => evaluateMetadata(spec, [])).toThrow(/value: myValue/u);
  });

  it('throws when callable returns an array', () => {
    const spec = resolveMetaDataSpec(
      callable(((_args: unknown[]) => [1, 2]) as unknown as (
        args: unknown[],
      ) => Record<string, unknown>),
    );
    expect(() => evaluateMetadata(spec, [])).toThrow(/cannot be an array/u);
  });

  it('throws when callable returns a Date', () => {
    const spec = resolveMetaDataSpec(
      callable(
        ((_args: unknown[]) => new Date()) as unknown as (
          args: unknown[],
        ) => Record<string, unknown>,
      ),
    );
    expect(() => evaluateMetadata(spec, [])).toThrow(/must be a plain object/u);
  });
});
