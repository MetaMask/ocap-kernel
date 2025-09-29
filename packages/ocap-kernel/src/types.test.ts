import type { Message, VatSyscallObject } from '@agoric/swingset-liveslots';
import { describe, it, expect } from 'vitest';

import {
  isVatConfig,
  insistMessage,
  coerceMessage,
  coerceVatSyscallObject,
  queueTypeFromActionType,
  isGCActionType,
  insistGCActionType,
  isGCAction,
  isVatMessageId,
  isSubclusterId,
  isVatId,
  isRemoteId,
  isEndpointId,
  insistVatId,
  insistEndpointId,
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

describe('coerceMessage', () => {
  it('removes undefined result field', () => {
    const messageWithUndefined = {
      methargs: { body: 'test', slots: [] },
      result: undefined,
    };

    const coerced = coerceMessage(messageWithUndefined as unknown as Message);
    expect(coerced).not.toHaveProperty('result');
    expect(coerced.methargs).toStrictEqual({ body: 'test', slots: [] });
  });

  it('preserves defined result field', () => {
    const messageWithResult = {
      methargs: { body: 'test', slots: [] },
      result: 'kp1',
    };

    const coerced = coerceMessage(messageWithResult);
    expect(coerced.result).toBe('kp1');
    expect(coerced.methargs).toStrictEqual({ body: 'test', slots: [] });
  });
});

describe('coerceVatSyscallObject', () => {
  it('coerces send syscalls to use coerced message', () => {
    const sendSyscall = [
      'send',
      'target',
      { methargs: { body: 'test', slots: [] }, result: undefined },
    ] as unknown as VatSyscallObject;

    const coerced = coerceVatSyscallObject(sendSyscall);
    expect(coerced[0]).toBe('send');
    expect(coerced[1]).toBe('target');
    expect(coerced[2]).not.toHaveProperty('result');
  });

  it('passes through non-send syscalls unchanged', () => {
    const resolveSyscall = [
      'resolve',
      [['kp1', false, { body: 'data', slots: [] }]],
    ] as unknown as VatSyscallObject;

    const coerced = coerceVatSyscallObject(resolveSyscall);
    expect(coerced).toBe(resolveSyscall);
  });
});

describe('isVatId', () => {
  it.each(['v0', 'v1', 'v42', 'v123456789'])(
    'returns true for valid vat ID %s',
    (id) => {
      expect(isVatId(id)).toBe(true);
    },
  );

  it.each([
    { name: 'wrong prefix r', value: 'r1' },
    { name: 'wrong prefix x', value: 'x1' },
    { name: 'missing number part', value: 'v' },
    { name: 'non-numeric suffix', value: 'va' },
    { name: 'mixed suffix', value: 'v1a' },
    { name: 'number', value: 123 },
    { name: 'null', value: null },
  ])('returns false for $name', ({ value }) => {
    expect(isVatId(value)).toBe(false);
  });
});

describe('isRemoteId', () => {
  it.each(['r0', 'r1', 'r42', 'r123456789'])(
    'returns true for valid remote ID %s',
    (id) => {
      expect(isRemoteId(id)).toBe(true);
    },
  );

  it.each([
    { name: 'wrong prefix v', value: 'v1' },
    { name: 'wrong prefix x', value: 'x1' },
    { name: 'missing number part', value: 'r' },
    { name: 'non-numeric suffix', value: 'ra' },
    { name: 'mixed suffix', value: 'r1a' },
  ])('returns false for $name', ({ value }) => {
    expect(isRemoteId(value)).toBe(false);
  });
});

describe('isEndpointId', () => {
  it.each(['v0', 'v1', 'r0', 'r1', 'v42', 'r123456789'])(
    'returns true for valid endpoint ID %s',
    (id) => {
      expect(isEndpointId(id)).toBe(true);
    },
  );

  it.each([
    { name: 'wrong prefix x', value: 'x1' },
    { name: 'missing number part', value: 'v' },
    { name: 'non-numeric suffix', value: 'va' },
  ])('returns false for $name', ({ value }) => {
    expect(isEndpointId(value)).toBe(false);
  });
});

describe('isSubclusterId', () => {
  it.each(['s0', 's1', 's42', 's123456789'])(
    'returns true for valid subcluster ID %s',
    (id) => {
      expect(isSubclusterId(id)).toBe(true);
    },
  );

  it.each([
    { name: 'wrong prefix v', value: 'v1' },
    { name: 'wrong prefix x', value: 'x1' },
    { name: 'missing number part', value: 's' },
    { name: 'non-numeric suffix', value: 'sa' },
  ])('returns false for $name', ({ value }) => {
    expect(isSubclusterId(value)).toBe(false);
  });
});

describe('insistVatId', () => {
  it.each(['v0', 'v1', 'v42'])('does not throw for valid vat ID %s', (id) => {
    expect(() => insistVatId(id)).not.toThrow();
  });

  it.each([
    { name: 'invalid format', value: 'invalid' },
    { name: 'wrong prefix', value: 'r1' },
    { name: 'number', value: 123 },
  ])('throws for $name', ({ value }) => {
    expect(() => insistVatId(value)).toThrow('not a valid VatId');
  });
});

describe('insistEndpointId', () => {
  it.each(['v0', 'v1', 'r0', 'r1'])(
    'does not throw for valid endpoint ID %s',
    (id) => {
      expect(() => insistEndpointId(id)).not.toThrow();
    },
  );

  it.each([
    { name: 'invalid format', value: 'invalid' },
    { name: 'wrong prefix', value: 'x1' },
    { name: 'number', value: 123 },
  ])('throws for $name', ({ value }) => {
    expect(() => insistEndpointId(value)).toThrow('not a valid EndpointId');
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
