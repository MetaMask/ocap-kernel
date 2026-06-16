import { describe, it, expect, vi } from 'vitest';

import {
  capability,
  extractCapabilities,
  extractValidatedCapabilities,
} from './capability.ts';

describe('capability', () => {
  it('creates a capability with func and schema', () => {
    const testCapability = capability(async () => Promise.resolve('test'), {
      description: 'a test capability',
      args: { type: 'object', properties: {} },
    });
    expect(testCapability.func).toBeInstanceOf(Function);
    expect(testCapability.schema).toStrictEqual({
      description: 'a test capability',
      args: { type: 'object', properties: {} },
    });
  });
});

describe('extractValidatedCapabilities', () => {
  const makeAdd = () =>
    capability<{ a: number; b: number }, number>(
      async ({ a, b }) => Promise.resolve(a + b),
      {
        description: 'add',
        args: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
          required: ['a', 'b'],
        },
      },
    );

  it('invokes the underlying function when args match the schema', async () => {
    const validated = extractValidatedCapabilities({ add: makeAdd() });
    expect(await validated.add({ a: 1, b: 2 } as never)).toBe(3);
  });

  it('throws before invoking when args do not match the schema', () => {
    const func = vi.fn(async () => Promise.resolve(0));
    const validated = extractValidatedCapabilities({
      add: capability(func, {
        description: 'add',
        args: {
          type: 'object',
          properties: { a: { type: 'number' }, b: { type: 'number' } },
          required: ['a', 'b'],
        },
      }),
    });
    expect(() => {
      // Validation throws synchronously before any promise is produced.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      validated.add({ a: 'nope', b: 2 } as never);
    }).toThrow(/Expected a number/u);
    expect(func).not.toHaveBeenCalled();
  });

  it('preserves the same keys as extractCapabilities', () => {
    const capabilities = { add: makeAdd() };
    expect(
      Object.keys(extractValidatedCapabilities(capabilities)),
    ).toStrictEqual(Object.keys(extractCapabilities(capabilities)));
  });
});
