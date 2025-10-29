import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_OPTIONS, mergeOptions, parseOptions } from './options.ts';
import type { LoggerOptions, LogLevel, Transport } from './types.ts';

const mocks = vi.hoisted(() => ({
  consoleTransport: vi.fn(),
}));

vi.mock('./transports.ts', () => ({
  consoleTransport: mocks.consoleTransport,
}));

describe('parseOptions', () => {
  it('parses an undefined options bag', () => {
    const options = parseOptions(undefined);
    expect(options).toStrictEqual({ transports: [mocks.consoleTransport] });
  });

  it('parses an empty options bag', () => {
    const options = parseOptions({});
    expect(options).toStrictEqual({ transports: [mocks.consoleTransport] });
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
      transports: [mocks.consoleTransport],
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

  it.each([
    { left: { level: 'warn' }, right: { level: 'error' }, result: 'error' },
    { left: { level: undefined }, right: { level: 'warn' }, result: 'warn' },
    { left: { level: 'info' }, right: {}, result: 'info' },
  ] as { left: LoggerOptions; right: LoggerOptions; result: LogLevel }[])(
    'merges levels as expected: $left and $right',
    ({ left, right, result }) => {
      const options = mergeOptions(
        { ...left, transports: [] },
        { ...right, transports: [] },
      );
      expect(options.level).toBe(result);
    },
  );
});
