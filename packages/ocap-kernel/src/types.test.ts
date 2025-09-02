import { describe, it, expect } from 'vitest';

import {
  isVatConfig,
  insistMessage,
  queueTypeFromActionType,
  isGCActionType,
  insistGCActionType,
  isGCAction,
  isVatMessageId,
} from './types.ts';

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

  it.each([
    {
      name: 'with valid platformConfig',
      config: {
        bundleSpec: 'bundle.js',
        platformConfig: {
          fetch: { allowedHosts: ['api.github.com'] },
        },
      },
      expected: true,
    },
    {
      name: 'with valid platformConfig and other options',
      config: {
        bundleSpec: 'bundle.js',
        creationOptions: { foo: 'bar' },
        parameters: { baz: 123 },
        platformConfig: {
          fetch: { allowedHosts: ['api.github.test'] },
          fs: { rootDir: '/tmp', existsSync: true },
        },
      },
      expected: true,
    },
  ])('validates $name', ({ config, expected }) => {
    expect(isVatConfig(config)).toBe(expected);
  });

  it.each([
    {
      name: 'invalid platformConfig structure',
      config: {
        bundleSpec: 'bundle.js',
        platformConfig: {
          fetch: { allowedHosts: 'not-an-array' },
        },
      },
    },
    {
      name: 'invalid platformConfig fetch config',
      config: {
        bundleSpec: 'bundle.js',
        platformConfig: {
          fetch: { invalidField: 'value' },
        },
      },
    },
  ])('rejects configs with $name', ({ config }) => {
    expect(isVatConfig(config)).toBe(false);
  });
});

describe('insistMessage', () => {
  it('does not throw for valid message objects', () => {
    const validMessage = {
      methargs: { body: 'body content', slots: [] },
      result: 'kp1',
    };

    expect(() => insistMessage(validMessage)).not.toThrow();
  });

  it.each([
    { name: 'empty object', value: {} },
    { name: 'incomplete methargs', value: { methargs: {} } },
    { name: 'missing slots', value: { methargs: { body: 'body' } } },
    { name: 'missing methargs', value: { result: 'kp1' } },
  ])('throws for $name', ({ value }) => {
    expect(() => insistMessage(value)).toThrow('not a valid message');
  });
});

describe('queueTypeFromActionType', () => {
  it('maps GC action types to queue event types', () => {
    // Note: From singular to plural
    expect(queueTypeFromActionType.get('dropExport')).toBe('dropExports');
    expect(queueTypeFromActionType.get('retireExport')).toBe('retireExports');
    expect(queueTypeFromActionType.get('retireImport')).toBe('retireImports');
    expect(queueTypeFromActionType.size).toBe(3);
  });
});

describe('isGCActionType', () => {
  it.each(['dropExport', 'retireExport', 'retireImport'])(
    'returns true for valid GC action type %s',
    (value) => {
      expect(isGCActionType(value)).toBe(true);
    },
  );

  it.each([
    { name: 'invalid string', value: 'invalidAction' },
    { name: 'empty string', value: '' },
    { name: 'number', value: 123 },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
  ])('returns false for $name', ({ value }) => {
    expect(isGCActionType(value)).toBe(false);
  });
});

describe('insistGCActionType', () => {
  it.each(['dropExport', 'retireExport', 'retireImport'])(
    'does not throw for valid GC action type %s',
    (value) => {
      expect(() => insistGCActionType(value)).not.toThrow();
    },
  );

  it.each([
    { name: 'invalid string', value: 'invalidAction' },
    { name: 'empty string', value: '' },
    { name: 'number', value: 123 },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
  ])('throws for $name', ({ value }) => {
    expect(() => insistGCActionType(value)).toThrow('not a valid GCActionType');
  });
});

describe('isGCAction', () => {
  it.each([
    'v1 dropExport ko123',
    'v2 retireExport ko456',
    'v3 retireImport ko789',
  ])('returns true for valid GC action %s', (value) => {
    expect(isGCAction(value)).toBe(true);
  });

  it.each([
    { name: 'invalid vatId', value: 'invalid dropExport ko123' },
    { name: 'invalid action type', value: 'v1 invalidAction ko123' },
    { name: 'invalid kref', value: 'v1 dropExport invalid' },
    { name: 'number', value: 123 },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
    { name: 'missing spaces', value: 'v1dropExportko123' },
  ])('returns false for $name', ({ value }) => {
    expect(isGCAction(value)).toBe(false);
  });
});

describe('isVatMessageId', () => {
  it.each(['m0', 'm1', 'm42', 'm123456789'])(
    'returns true for valid message ID %s',
    (id) => {
      expect(isVatMessageId(id)).toBe(true);
    },
  );

  it.each([
    { name: 'wrong prefix x', value: 'x1' },
    { name: 'wrong prefix n', value: 'n42' },
    { name: 'missing number part', value: 'm' },
    { name: 'non-numeric suffix (a)', value: 'ma' },
    { name: 'non-numeric suffix (1a)', value: 'm1a' },
    { name: 'non-numeric suffix (42x)', value: 'm42x' },
    { name: 'reversed format', value: '1m' },
    { name: 'double prefix', value: 'mm1' },
    { name: 'number', value: 123 },
    { name: 'null', value: null },
    { name: 'undefined', value: undefined },
    { name: 'object', value: {} },
    { name: 'array', value: [] },
  ])('returns false for $name', ({ value }) => {
    expect(isVatMessageId(value)).toBe(false);
  });
});
