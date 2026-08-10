import { describe, expect, it } from 'vitest';

import {
  MARKER_PREFIX,
  BridgeRpcError,
  expandMarkers,
  substituteRemotables,
} from './json-rpc.ts';

/** A stand-in for a remotable, identified by an isRemotable predicate. */
type FakeRemotable = { __fakeRemotable__: true; id: string };

const isFakeRemotable = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as { __fakeRemotable__?: unknown }).__fakeRemotable__ === true;

const makeFake = (id: string): FakeRemotable => ({
  __fakeRemotable__: true,
  id,
});

describe('expandMarkers', () => {
  const table = new Map<string, FakeRemotable>([
    ['j1', makeFake('one')],
    ['j2', makeFake('two')],
  ]);
  const resolve = (name: string): unknown => table.get(name);

  it('replaces a top-level marker string', () => {
    expect(expandMarkers('@@j1', resolve)).toBe(table.get('j1'));
  });

  it('leaves non-marker strings alone', () => {
    expect(expandMarkers('plain string', resolve)).toBe('plain string');
    expect(expandMarkers('@@', resolve)).toBe('@@');
    expect(expandMarkers('prefix@@j1', resolve)).toBe('prefix@@j1');
    expect(expandMarkers('@@j-1', resolve)).toBe('@@j-1');
  });

  it('walks nested arrays', () => {
    const result = expandMarkers(['@@j1', 42, '@@j2'], resolve);
    expect(result).toStrictEqual([table.get('j1'), 42, table.get('j2')]);
  });

  it('walks nested objects', () => {
    const result = expandMarkers(
      { target: '@@j1', label: 'ship', payload: { via: '@@j2' } },
      resolve,
    );
    expect(result).toStrictEqual({
      target: table.get('j1'),
      label: 'ship',
      payload: { via: table.get('j2') },
    });
  });

  it('passes through primitives untouched', () => {
    expect(expandMarkers(42, resolve)).toBe(42);
    expect(expandMarkers(null, resolve)).toBeNull();
    expect(expandMarkers(true, resolve)).toBe(true);
  });

  it('throws on an unknown marker', () => {
    expect(() => expandMarkers('@@missing', resolve)).toThrow(BridgeRpcError);
    expect(() => expandMarkers(['@@missing'], resolve)).toThrow(/@@missing/u);
  });
});

describe('substituteRemotables', () => {
  it('replaces a top-level remotable with a marker string', () => {
    const obj = makeFake('alpha');
    const nameOf = (): string => 'j5';
    expect(substituteRemotables(obj, isFakeRemotable, nameOf)).toBe(
      `${MARKER_PREFIX}j5`,
    );
  });

  it('walks nested arrays and objects', () => {
    const alpha = makeFake('alpha');
    const beta = makeFake('beta');
    const counter = { n: 0 };
    const assigned = new Map<unknown, string>();
    const assign = (obj: unknown): string => {
      const existing = assigned.get(obj);
      if (existing !== undefined) {
        return existing;
      }
      counter.n += 1;
      const name = `j${counter.n}`;
      assigned.set(obj, name);
      return name;
    };
    const result = substituteRemotables(
      { via: alpha, args: [beta, 'plain', { echo: alpha }] },
      isFakeRemotable,
      assign,
    );
    expect(result).toStrictEqual({
      via: '@@j1',
      args: ['@@j2', 'plain', { echo: '@@j1' }],
    });
  });

  it.each([
    ['a bare promise', (): unknown => new Promise(() => undefined)],
    [
      'a nested promise',
      (): unknown => ({ inner: new Promise(() => undefined) }),
    ],
    ['a promise in an array', (): unknown => [new Promise(() => undefined)]],
    ['a foreign thenable', (): unknown => ({ then: () => undefined })],
  ])('refuses to serialize %s', (_label, make) => {
    const assign = (): string => 'j1';
    // A promise has no own enumerable properties, so walking it would yield
    // `{}` and JSON.stringify would accept that — the client would receive a
    // success response with the value silently gone.
    expect(() => substituteRemotables(make(), isFakeRemotable, assign)).toThrow(
      /unsettled promise/u,
    );
  });

  it.each([
    ['NaN', (): unknown => Number.NaN, /NaN/u],
    ['Infinity', (): unknown => Number.POSITIVE_INFINITY, /Infinity/u],
    ['-Infinity', (): unknown => Number.NEGATIVE_INFINITY, /-Infinity/u],
    ['a nested NaN', (): unknown => ({ ratio: Number.NaN }), /NaN/u],
    [
      'an Infinity in an array',
      (): unknown => [Number.POSITIVE_INFINITY],
      /Infinity/u,
    ],
  ])('rejects %s rather than emitting null', (_label, make, pattern) => {
    const assign = (): string => 'j1';
    // JSON.stringify turns a non-finite number into `null`, which is exactly
    // what a void method produces — so the client cannot tell a missing value
    // from a real one.
    expect(() => substituteRemotables(make(), isFakeRemotable, assign)).toThrow(
      pattern,
    );
  });

  it('leaves -0 alone, since it serializes to a numerically equal 0', () => {
    const assign = (): string => 'unused';
    expect(substituteRemotables(-0, isFakeRemotable, assign)).toBe(-0);
  });

  it('leaves primitives and non-remotable objects alone', () => {
    const assign = (): string => 'unused';
    expect(substituteRemotables(42, isFakeRemotable, assign)).toBe(42);
    expect(substituteRemotables(null, isFakeRemotable, assign)).toBeNull();
    expect(substituteRemotables('text', isFakeRemotable, assign)).toBe('text');
    expect(
      substituteRemotables({ a: 1, b: [2, 3] }, isFakeRemotable, assign),
    ).toStrictEqual({ a: 1, b: [2, 3] });
  });

  it('emits a JSON-serializable tree', () => {
    const alpha = makeFake('alpha');
    const assign = (): string => 'j1';
    const tree = substituteRemotables(
      { via: alpha, args: [alpha, 'plain'] },
      isFakeRemotable,
      assign,
    );
    // The whole point of substituteRemotables is that the result can be
    // JSON-stringified without special handling.
    expect(() => JSON.stringify(tree)).not.toThrow();
    expect(JSON.parse(JSON.stringify(tree))).toStrictEqual({
      via: '@@j1',
      args: ['@@j1', 'plain'],
    });
  });
});
