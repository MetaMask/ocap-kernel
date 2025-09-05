import { describe, it, expect } from 'vitest';

import { objectDisjointUnion } from './object-disjoint-union.ts';

describe('objectDisjointUnion', () => {
  it('combines objects with no overlapping keys', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { c: 3, d: 4 };
    const obj3 = { e: 5 };

    const result = objectDisjointUnion(obj1, obj2, obj3);

    expect(result).toStrictEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
    });
  });

  it('handles single object', () => {
    const obj = { a: 1, b: 2 };

    const result = objectDisjointUnion(obj);

    expect(result).toStrictEqual({ a: 1, b: 2 });
  });

  it('handles empty objects', () => {
    const result = objectDisjointUnion({}, { a: 1 }, {});

    expect(result).toStrictEqual({ a: 1 });
  });

  it('handles no arguments', () => {
    const result = objectDisjointUnion();

    expect(result).toStrictEqual({});
  });

  it('preserves object values including functions and nested objects', () => {
    const fn = () => 'test';
    const nested = { inner: 'value' };
    const obj1 = { a: fn };
    const obj2 = { b: nested };

    const result = objectDisjointUnion(obj1, obj2);

    expect(result).toStrictEqual({
      a: fn,
      b: nested,
    });
  });

  it.each([
    [
      'duplicate key in first two objects',
      [{ a: 1 }, { a: 2 }],
      'Duplicate keys in objects: a, found in entries 0 and 1',
      { originalIndex: 0, collidingIndex: 1, key: 'a' },
    ],
    [
      'duplicate key in first and third objects',
      [{ a: 1 }, { b: 2 }, { a: 3 }],
      'Duplicate keys in objects: a, found in entries 0 and 2',
      { originalIndex: 0, collidingIndex: 2, key: 'a' },
    ],
    [
      'duplicate key in middle objects',
      [{ a: 1 }, { b: 2, c: 3 }, { c: 4 }],
      'Duplicate keys in objects: c, found in entries 1 and 2',
      { originalIndex: 1, collidingIndex: 2, key: 'c' },
    ],
  ])('throws error when %s', (_, objects, expectedMessage, expectedCause) => {
    const expectedError = new Error(expectedMessage, { cause: expectedCause });
    expect(() => objectDisjointUnion(...objects)).toThrow(expectedError);
  });
});
