import { describe, it, expect, vi } from 'vitest';

import {
  consoleTransport,
  DEFAULT_OPTIONS,
  Logger,
  makeLogger,
  mergeOptions,
} from './logger.ts';
import type { LoggerOptions, LogLevel } from './logger.ts';

const consoleMethod = ['log', 'debug', 'info', 'warn', 'error'] as const;

describe('Logger', () => {
  it('can be created from a string', () => {
    const logSpy = vi.spyOn(console, 'log');
    const logger = new Logger('test');
    logger.log('foo');
    expect(logger).toBeInstanceOf(Logger);
    expect(logSpy).toHaveBeenCalledWith(['test'], 'foo');
  });

  it.each(consoleMethod)('has method %j', (method) => {
    const testLogger = new Logger({ tags: ['test'] });
    expect(testLogger).toHaveProperty(method);
    expect(testLogger[method]).toBeTypeOf('function');
  });

  it.each(consoleMethod)(
    'calls %j with the provided tags followed by a single argument',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const tags = ['test'];
      const testLogger = new Logger({ tags });
      testLogger[method]('foo');
      expect(methodSpy).toHaveBeenCalledWith(tags, 'foo');
    },
  );

  it.each(consoleMethod)(
    'calls %j with the provided tags followed by multiple arguments',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const tags = ['test'];
      const testLogger = new Logger({ tags });
      testLogger[method]('foo', { bar: 'bar' });
      expect(methodSpy).toHaveBeenCalledWith(tags, 'foo', { bar: 'bar' });
    },
  );

  it.each(consoleMethod)(
    'calls %j with the provided tags when given no argument',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const tags = ['test'];
      const testLogger = new Logger({ tags });
      testLogger[method]();
      expect(methodSpy).toHaveBeenCalledWith(tags);
    },
  );

  it('can be nested', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const vatLogger = new Logger({ tags: ['vat 0x01'] });
    const subLogger = vatLogger.subLogger({ tags: ['(process)'] });
    subLogger.log('foo');
    expect(consoleSpy).toHaveBeenCalledWith(['vat 0x01', '(process)'], 'foo');
  });

  it('omits tagline when no tags are provided', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const logger = new Logger();
    logger.log('foo');
    expect(consoleSpy).toHaveBeenCalledWith('foo');
  });

  it('passes objects directly in the data field', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const logger = new Logger({ tags: ['test'] });
    const message = 'foo';
    const data = { bar: 'bar' };
    logger.log(message, data);
    expect(consoleSpy).toHaveBeenCalledWith(['test'], message, data);
  });

  describe('subLogger', () => {
    it('creates a new logger with the merged options', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const logger = new Logger({ tags: ['test'] });
      const subLogger = logger.subLogger({ tags: ['sub'] });
      expect(subLogger).toBeInstanceOf(Logger);
      subLogger.log('foo');
      expect(consoleSpy).toHaveBeenCalledWith(['test', 'sub'], 'foo');
    });

    it('works with no options', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const logger = new Logger({ tags: ['test'] });
      const subLogger = logger.subLogger();
      expect(subLogger).toBeInstanceOf(Logger);
      subLogger.log('foo');
      expect(consoleSpy).toHaveBeenCalledWith(['test'], 'foo');
    });

    it('works with a string', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const logger = new Logger({ tags: ['test'] });
      const subLogger = logger.subLogger('sub');
      expect(subLogger).toBeInstanceOf(Logger);
      subLogger.log('foo');
      expect(consoleSpy).toHaveBeenCalledWith(['test', 'sub'], 'foo');
    });
  });
});

describe('consoleTransport', () => {
  it.each(consoleMethod)('logs to the console with method %j', (method) => {
    const consoleSpy = vi.spyOn(console, method);
    const logger = new Logger({ tags: ['test'] });
    logger[method]('foo');
    expect(consoleSpy).toHaveBeenCalledWith(['test'], 'foo');
  });

  it.each(consoleMethod)('default data is an empty array for %j', (level) => {
    const consoleSpy = vi.spyOn(console, level);
    const entry = { tags: ['test'], level, message: 'foo' };
    consoleTransport(entry);
    expect(consoleSpy).toHaveBeenCalledWith(['test'], 'foo');
  });

  it('does not log when the level is silent', () => {
    const consoleMethodSpies = consoleMethod.map((method) =>
      vi.spyOn(console, method),
    );
    consoleTransport({ tags: ['test'], level: 'silent', message: 'foo' });
    consoleMethodSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
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

  const transportA = vi.fn();
  const transportB = vi.fn();

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

describe('makeLogger', () => {
  it('creates a new logger from a label and a parent logger', () => {
    const logger = new Logger({ tags: ['test'] });
    const subLogger = makeLogger('sub', logger);
    expect(subLogger).toBeInstanceOf(Logger);
  });

  it('creates a new logger from a label', () => {
    const logSpy = vi.spyOn(console, 'log');
    const logger = makeLogger('test');
    expect(logger).toBeInstanceOf(Logger);
    logger.log('foo');
    expect(logSpy).toHaveBeenCalledWith(['test'], 'foo');
  });
});
