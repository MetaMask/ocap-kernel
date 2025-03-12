import { isObject } from '@metamask/utils';
import { describe, it, expect } from 'vitest';

import { isPrimitive, isTypedArray, isTypedObject } from './types.ts';

const isNumber = (value: unknown): value is number => typeof value === 'number';
const alwaysFalse = (): boolean => false;
const alwaysTrue = (): boolean => true;

describe('isPrimitive', () => {
  it.each`
    value
    ${''}
    ${'foo'}
    ${0}
    ${6.28}
    ${BigInt('9999999999999999')}
    ${Symbol('meaning')}
    ${false}
    ${null}
    ${undefined}
  `('returns true for primitive $value', ({ value }) => {
    expect(isPrimitive(value)).toBe(true);
  });

  it.each`
    value
    ${[]}
    ${{}}
    ${{ foo: 'bar' }}
    ${new MessageChannel()}
    ${alwaysTrue}
    ${function foo() {
  return 'bar';
}}
  `('returns false for invalid values: $value', ({ value }) => {
    expect(isPrimitive(value)).toBe(false);
  });
});

describe('isTypedArray', () => {
  it.each`
    value                   | guard
    ${[]}                   | ${alwaysFalse}
    ${[0, 2, 4.5]}          | ${isNumber}
    ${[0, 'foo']}           | ${isPrimitive}
    ${[{}, { foo: 'bar' }]} | ${isObject}
    ${[[]]}                 | ${Array.isArray}
  `('returns true for homogeneously typed array $value', ({ value, guard }) => {
    expect(isTypedArray(value, guard)).toBe(true);
  });

  it.each`
    value         | guard
    ${[null]}     | ${alwaysFalse}
    ${0}          | ${isNumber}
    ${null}       | ${alwaysTrue}
    ${[0, 'foo']} | ${isNumber}
    ${[0, [1]]}   | ${isNumber}
    ${[{}, 1]}    | ${isObject}
  `('returns false for invalid values: $value', ({ value, guard }) => {
    expect(isTypedArray(value, guard)).toBe(false);
  });
});

describe('isTypedObject', () => {
  it.each`
    value                           | guard
    ${{}}                           | ${alwaysFalse}
    ${{ foo: 0, bar: 2 }}           | ${isNumber}
    ${{ foo: {}, bar: { foo: 0 } }} | ${isObject}
  `(
    'returns true for homogeneously typed object $value',
    ({ value, guard }) => {
      expect(isTypedObject(value, guard)).toBe(true);
    },
  );

  it.each`
    value                    | guard
    ${{ foo: 'bar' }}        | ${alwaysFalse}
    ${null}                  | ${alwaysTrue}
    ${[{}, { foo: 'bar ' }]} | ${isObject}
  `('returns false for invalid values: $value', ({ value, guard }) => {
    expect(isTypedObject(value, guard)).toBe(false);
  });
});
