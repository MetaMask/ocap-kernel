import { describe, it, expect } from 'vitest';

import { isVatConfig } from './types.js';

describe('isVatConfig', () => {
  it.each([
    {
      name: 'simple sourceSpec',
      config: { sourceSpec: 'source.js' },
      expected: true,
    },
    {
      name: 'sourceSpec with options',
      config: {
        sourceSpec: 'source.js',
        creationOptions: { foo: 'bar' },
        parameters: { baz: 123 },
      },
      expected: true,
    },
    {
      name: 'simple bundleSpec',
      config: { bundleSpec: 'bundle.js' },
      expected: true,
    },
    {
      name: 'bundleSpec with options',
      config: {
        bundleSpec: 'bundle.js',
        creationOptions: { foo: 'bar' },
        parameters: { baz: 123 },
      },
      expected: true,
    },
    {
      name: 'simple bundleName',
      config: { bundleName: 'myBundle' },
      expected: true,
    },
    {
      name: 'bundleName with options',
      config: {
        bundleName: 'myBundle',
        creationOptions: { foo: 'bar' },
        parameters: { baz: 123 },
      },
      expected: true,
    },
  ])('validates $name', ({ config, expected }) => {
    expect(isVatConfig(config)).toBe(expected);
  });

  it.each([
    {
      name: 'sourceSpec and bundleSpec',
      config: { sourceSpec: 'source.js', bundleSpec: 'bundle.js' },
    },
    {
      name: 'sourceSpec and bundleName',
      config: { sourceSpec: 'source.js', bundleName: 'myBundle' },
    },
    {
      name: 'bundleSpec and bundleName',
      config: { bundleSpec: 'bundle.js', bundleName: 'myBundle' },
    },
    {
      name: 'all three specs',
      config: {
        sourceSpec: 'source.js',
        bundleSpec: 'bundle.js',
        bundleName: 'myBundle',
      },
    },
  ])('rejects configs with $name', ({ config }) => {
    expect(isVatConfig(config)).toBe(false);
  });

  it.each([
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
    { name: 'string', value: 'string' },
    { name: 'number', value: 123 },
    { name: 'array', value: [] },
    { name: 'empty object', value: {} },
  ])('rejects $name', ({ value }) => {
    expect(isVatConfig(value)).toBe(false);
  });
});
