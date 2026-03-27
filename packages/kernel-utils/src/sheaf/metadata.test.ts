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
    expect(constant(42)).toStrictEqual({ kind: 'constant', value: 42 });
  });

  it('evaluateMetadata returns the value regardless of args', () => {
    const spec = resolveMetaDataSpec(constant({ cost: 7 }));
    expect(evaluateMetadata(spec, [])).toStrictEqual({ cost: 7 });
    expect(evaluateMetadata(spec, [1, 2, 3])).toStrictEqual({ cost: 7 });
  });
});

describe('callable', () => {
  it('returns a callable spec wrapping the function', () => {
    const fn = (args: unknown[]) => args[0] as number;
    const spec = callable(fn);
    expect(spec).toStrictEqual({ kind: 'callable', fn });
  });

  it('evaluateMetadata calls fn with args', () => {
    const fn = vi.fn((args: unknown[]) => (args[0] as number) * 2);
    const spec = resolveMetaDataSpec(callable(fn));
    expect(evaluateMetadata(spec, [5])).toBe(10);
    expect(fn).toHaveBeenCalledWith([5]);
  });
});

describe('source', () => {
  it('returns a source spec with the src string', () => {
    expect(source('(args) => args[0]')).toStrictEqual({
      kind: 'source',
      src: '(args) => args[0]',
    });
  });

  it('resolveMetaDataSpec compiles source to callable via compartment', () => {
    const mockFn = (args: unknown[]) => args[0] as number;
    const compartment = { evaluate: vi.fn(() => mockFn) };
    const spec = resolveMetaDataSpec(source('(args) => args[0]'), compartment);
    expect(spec.kind).toBe('callable');
    expect(compartment.evaluate).toHaveBeenCalledWith('(args) => args[0]');
    expect(evaluateMetadata(spec, [99])).toBe(99);
  });
});

describe('resolveMetaDataSpec', () => {
  it('passes constant spec through unchanged', () => {
    const spec = constant(42);
    expect(resolveMetaDataSpec(spec)).toStrictEqual(spec);
  });

  it('passes callable spec through unchanged', () => {
    const fn = (_args: unknown[]) => 0;
    const spec = callable(fn);
    expect(resolveMetaDataSpec(spec)).toStrictEqual(spec);
  });

  it("throws if kind is 'source' and no compartment supplied", () => {
    expect(() => resolveMetaDataSpec(source('() => 0'))).toThrow(
      "compartment required to evaluate 'source' metadata",
    );
  });
});

describe('evaluateMetadata', () => {
  it('returns undefined when spec is undefined', () => {
    expect(evaluateMetadata(undefined, [])).toBeUndefined();
    expect(evaluateMetadata(undefined, [1, 2])).toBeUndefined();
  });
});
