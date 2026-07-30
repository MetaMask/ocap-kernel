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
    ['o1', makeFake('one')],
    ['o2', makeFake('two')],
  ]);
  const resolve = (name: string): unknown => table.get(name);

  it('replaces a top-level marker string', () => {
    expect(expandMarkers('@@o1', resolve)).toBe(table.get('o1'));
  });

  it('leaves non-marker strings alone', () => {
    expect(expandMarkers('plain string', resolve)).toBe('plain string');
    expect(expandMarkers('@@', resolve)).toBe('@@');
    expect(expandMarkers('prefix@@o1', resolve)).toBe('prefix@@o1');
    expect(expandMarkers('@@o-1', resolve)).toBe('@@o-1');
  });

  it('walks nested arrays', () => {
    const result = expandMarkers(['@@o1', 42, '@@o2'], resolve);
    expect(result).toStrictEqual([table.get('o1'), 42, table.get('o2')]);
  });

  it('walks nested objects', () => {
    const result = expandMarkers(
      { target: '@@o1', label: 'ship', payload: { via: '@@o2' } },
      resolve,
    );
    expect(result).toStrictEqual({
      target: table.get('o1'),
      label: 'ship',
      payload: { via: table.get('o2') },
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
    const nameOf = (): string => 'o5';
    expect(substituteRemotables(obj, isFakeRemotable, nameOf)).toBe(
      `${MARKER_PREFIX}o5`,
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
      const name = `o${counter.n}`;
      assigned.set(obj, name);
      return name;
    };
    const result = substituteRemotables(
      { via: alpha, args: [beta, 'plain', { echo: alpha }] },
      isFakeRemotable,
      assign,
    );
    expect(result).toStrictEqual({
      via: '@@o1',
      args: ['@@o2', 'plain', { echo: '@@o1' }],
    });
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
    const assign = (): string => 'o1';
    const tree = substituteRemotables(
      { via: alpha, args: [alpha, 'plain'] },
      isFakeRemotable,
      assign,
    );
    // The whole point of substituteRemotables is that the result can be
    // JSON-stringified without special handling.
    expect(() => JSON.stringify(tree)).not.toThrow();
    expect(JSON.parse(JSON.stringify(tree))).toStrictEqual({
      via: '@@o1',
      args: ['@@o1', 'plain'],
    });
  });
});
