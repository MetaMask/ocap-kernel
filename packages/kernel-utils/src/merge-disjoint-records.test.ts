import { describe, it, expect } from 'vitest';

import { mergeDisjointRecords } from './merge-disjoint-records.ts';

describe('mergeDisjointRecords', () => {
  it.each([
    [
      'records with no overlapping keys',
      [{ a: 1, b: 2 }, { c: 3, d: 4 }, { e: 5 }],
      { a: 1, b: 2, c: 3, d: 4, e: 5 },
    ],
    ['single record', [{ a: 1, b: 2 }], { a: 1, b: 2 }],
    ['empty records', [{}, { a: 1 }, {}], { a: 1 }],
    ['no arguments', [], {}],
    [
      'record values including functions and nested records',
      [{ a: () => 'test' }, { b: { inner: 'value' } }],
      { a: expect.any(Function), b: { inner: 'value' } },
    ],
    [
      'records with Symbol keys',
      [{ [Symbol.for('key1')]: 'value1' }, { [Symbol.for('key2')]: 'value2' }],
      { [Symbol.for('key1')]: 'value1', [Symbol.for('key2')]: 'value2' },
    ],
    [
      'records with mixed string and Symbol keys',
      [{ a: 1, [Symbol.for('sym')]: 'symbol' }, { b: 2 }],
      { a: 1, [Symbol.for('sym')]: 'symbol', b: 2 },
    ],
    [
      'records with properties added via simple assignment',
      [
        Object.assign(Object.create(null), { a: 1 }),
        Object.assign(Object.create(null), { b: 2 }),
      ],
      { a: 1, b: 2 },
    ],
    [
      'records with Proxy that returns undefined descriptor',
      [
        new Proxy({ a: 1 }, { getOwnPropertyDescriptor: () => undefined }),
        { b: 2 },
      ],
      { a: 1, b: 2 },
    ],
  ])('handles %s', (_, records, expected) => {
    const result = mergeDisjointRecords(...records);
    expect(result).toStrictEqual(Object.assign(Object.create(null), expected));
  });

  it.each([
    [
      'duplicate key in first two records',
      [{ a: 1 }, { a: 2 }],
      'Duplicate keys in records: a, found in entries 0 and 1',
      { originalIndex: 0, collidingIndex: 1, key: 'a' },
    ],
    [
      'duplicate key in first and third records',
      [{ a: 1 }, { b: 2 }, { a: 3 }],
      'Duplicate keys in records: a, found in entries 0 and 2',
      { originalIndex: 0, collidingIndex: 2, key: 'a' },
    ],
    [
      'duplicate key in middle records',
      [{ a: 1 }, { b: 2, c: 3 }, { c: 4 }],
      'Duplicate keys in records: c, found in entries 1 and 2',
      { originalIndex: 1, collidingIndex: 2, key: 'c' },
    ],
    [
      'duplicate Symbol key in first two records',
      [{ [Symbol.for('key')]: 1 }, { [Symbol.for('key')]: 2 }],
      'Duplicate keys in records: Symbol(key), found in entries 0 and 1',
      { originalIndex: 0, collidingIndex: 1, key: Symbol.for('key') },
    ],
    [
      'duplicate Symbol key in mixed records',
      [
        { a: 1, [Symbol.for('sym')]: 'value1' },
        { b: 2, [Symbol.for('sym')]: 'value2' },
      ],
      'Duplicate keys in records: Symbol(sym), found in entries 0 and 1',
      { originalIndex: 0, collidingIndex: 1, key: Symbol.for('sym') },
    ],
  ])('throws error when %s', (_, records, expectedMessage, expectedCause) => {
    expect(() => mergeDisjointRecords(...records)).toThrow(
      new Error(expectedMessage, { cause: expectedCause }),
    );
  });

  describe('property descriptor preservation', () => {
    it('preserves non-enumerable properties', () => {
      const result = mergeDisjointRecords(
        Object.create(null, { a: { value: 1, enumerable: false } }),
        Object.create(null, { b: { value: 2, enumerable: true } }),
      );
      expect(Object.getOwnPropertyDescriptor(result, 'a')).toStrictEqual({
        value: 1,
        writable: false,
        enumerable: false,
        configurable: false,
      });
      expect(Object.getOwnPropertyDescriptor(result, 'b')).toStrictEqual({
        value: 2,
        writable: false,
        enumerable: true,
        configurable: false,
      });
    });

    it('preserves non-writable properties', () => {
      const result = mergeDisjointRecords(
        Object.create(null, { a: { value: 1, writable: false } }),
        Object.create(null, { b: { value: 2, writable: true } }),
      );
      expect(() => {
        result.a = 999;
      }).toThrow(/Cannot assign to read only property/u);
      expect(result.a).toBe(1);
      result.b = 999;
      expect(result.b).toBe(999);
    });

    it('preserves non-configurable properties', () => {
      const result = mergeDisjointRecords(
        Object.create(null, { a: { value: 1, configurable: false } }),
        Object.create(null, { b: { value: 2, configurable: true } }),
      );
      expect(() => {
        delete result.a;
      }).toThrow(/Cannot delete property/u);
      expect(result.a).toBe(1);
      delete result.b;
      expect(result.b).toBeUndefined();
    });

    it('preserves getter/setter properties', () => {
      let getterValue = 42;
      const result = mergeDisjointRecords(
        Object.create(null, {
          a: {
            get: () => getterValue,
            set: (value: number) => {
              getterValue = value * 2;
            },
            enumerable: true,
            configurable: true,
          },
        }),
        { b: 2 },
      );
      expect(result.a).toBe(42);
      result.a = 10;
      expect(result.a).toBe(20);
      expect(getterValue).toBe(20);
      expect(result.b).toBe(2);
    });

    it('preserves Symbol property descriptors', () => {
      const sym = Symbol('test');
      const result = mergeDisjointRecords(
        Object.create(null, {
          [sym]: { value: 'symbol value', writable: false, enumerable: false },
        }),
        { a: 1 },
      );
      expect(Object.getOwnPropertyDescriptor(result, sym)).toStrictEqual({
        value: 'symbol value',
        writable: false,
        enumerable: false,
        configurable: false,
      });
      expect(result[sym]).toBe('symbol value');
    });
  });
});
