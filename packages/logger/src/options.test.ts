import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_OPTIONS, mergeOptions, parseOptions } from './options.ts';
import type { Transport } from './types.ts';

const mocks = vi.hoisted(() => ({
  makeConsoleTransport: vi.fn(),
}));

vi.mock('./transports.ts', () => ({
  makeConsoleTransport: mocks.makeConsoleTransport,
}));

describe('parseOptions', () => {
  it('parses an undefined options bag', () => {
    const options = parseOptions(undefined);
    expect(options).toStrictEqual({
      transports: [mocks.makeConsoleTransport()],
    });
  });

  it('parses an empty options bag', () => {
    const options = parseOptions({});
    expect(options).toStrictEqual({
      transports: [mocks.makeConsoleTransport()],
    });
  });

  it('parses an options bag', () => {
    const mockTransport = vi.fn() as Transport;
    const options = parseOptions({
      tags: ['test'],
      transports: [mockTransport],
    });
    expect(options).toStrictEqual({
      tags: ['test'],
      transports: [mockTransport],
    });
  });

  it('parses a string', () => {
    const options = parseOptions('test');
    expect(options).toStrictEqual({
      tags: ['test'],
      transports: [mocks.makeConsoleTransport()],
    });
  });

  it.each([[0], [Symbol('test')], [true], [false]])(
    'throws an error if the options are invalid: %j',
    (value) => {
      // @ts-expect-error Invalid options
      expect(() => parseOptions(value)).toThrow(/Invalid logger options/u);
    },
  );
});

describe('mergeOptions', () => {
  it.each([
    { left: ['test'], right: ['sub'], result: ['test', 'sub'] },
    { left: ['test', 'test'], right: ['sub'], result: ['test', 'sub'] },
    {
      left: ['test', 'fizz'],
      right: ['test', 'buzz'],
      result: ['test', 'fizz', 'buzz'],
    },
  ])('merges tags as expected: $left and $right', ({ left, right, result }) => {
    const options = mergeOptions({ tags: left }, { tags: right });
    expect(options.tags).toStrictEqual(result);
  });

  it('defaults to the default options', () => {
    const options = mergeOptions();
    expect(options).toStrictEqual(DEFAULT_OPTIONS);
  });

  const transportA = vi.fn() as Transport;
  const transportB = vi.fn() as Transport;

  it.each([
    { left: { transports: [] }, right: { transports: [] }, result: [] },
    {
      left: { transports: [transportA] },
      right: { transports: [] },
      result: [transportA],
    },
    {
      left: { transports: [transportA] },
      right: { transports: [transportA] },
      result: [transportA],
    },
    {
      left: { transports: [transportA] },
      right: { transports: [transportB] },
      result: [transportA, transportB],
    },
  ])(
    'merges transports as expected: $left and $right',
    ({ left, right, result }) => {
      const options = mergeOptions(left, right);
      expect(options.transports).toStrictEqual([
        ...DEFAULT_OPTIONS.transports,
        ...result,
      ]);
    },
  );
});
