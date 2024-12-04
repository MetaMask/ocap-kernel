import { describe, it, expect } from 'vitest';

import { isVatId, isSupervisorId, isVatMessageId, isVatConfig } from './types';

describe('isVatId', () => {
  it.each([
    ['v0', true],
    ['v1', true],
    ['v123', true],
    ['v', false],
    ['v01', true],
    ['v1.2', false],
    ['v-1', false],
    ['x1', false],
    ['', false],
    [123, false],
    [null, false],
    [undefined, false],
  ])('returns %s for %s', (value, expected) => {
    expect(isVatId(value)).toBe(expected);
  });
});

describe('isSupervisorId', () => {
  it.each([
    ['v0_supervisor', true],
    ['v1_supervisor', true],
    ['v123_supervisor', true],
    ['v_supervisor', false],
    ['v01_supervisor', true],
    ['v1.2_supervisor', false],
    ['v1_super', false],
    ['x1_supervisor', false],
    ['', false],
    [123, false],
    [null, false],
    [undefined, false],
  ])('returns %s for %s', (value, expected) => {
    expect(isSupervisorId(value)).toBe(expected);
  });
});

describe('isVatMessageId', () => {
  it.each([
    ['m0', true],
    ['m1', true],
    ['m123', true],
    ['m', false],
    ['m01', true],
    ['m1.2', false],
    ['m-1', false],
    ['x1', false],
    ['', false],
    [123, false],
    [null, false],
    [undefined, false],
  ])('returns %s for %s', (value, expected) => {
    expect(isVatMessageId(value)).toBe(expected);
  });
});

describe('isVatConfig', () => {
  it.each([
    [{ sourceSpec: 'test.js' }, true],
    [
      {
        sourceSpec: 'test.js',
        creationOptions: { foo: 'bar' },
        parameters: { baz: 123 },
      },
      true,
    ],
    [{ bundleSpec: 'bundle.js' }, true],
    [
      {
        bundleSpec: 'bundle.js',
        creationOptions: { foo: 'bar' },
      },
      true,
    ],
    [{ bundleName: 'myBundle' }, true],
    [
      {
        bundleName: 'myBundle',
        parameters: { foo: 'bar' },
      },
      true,
    ],
    [{}, false],
    [{ sourceSpec: 123 }, false],
    [{ sourceSpec: 'test.js', bundleSpec: 'bundle.js' }, false],
    [{ sourceSpec: 'test.js', bundleName: 'myBundle' }, false],
    [{ creationOptions: 'invalid' }, false],
    [{ parameters: 'invalid' }, false],
    [null, false],
    [undefined, false],
  ])('returns %s for %o', (value, expected) => {
    expect(isVatConfig(value)).toBe(expected);
  });
});
