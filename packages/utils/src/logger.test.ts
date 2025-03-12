import { describe, it, expect, vi } from 'vitest';

import { makeLogger } from './logger.ts';

describe('makeLogger', () => {
  const consoleMethod = ['log', 'debug', 'info', 'warn', 'error'] as const;

  it.each(consoleMethod)('has method %j', (method) => {
    const testLogger = makeLogger('test');
    expect(testLogger).toHaveProperty(method);
    expect(testLogger[method]).toBeTypeOf('function');
  });

  it.each(consoleMethod)(
    'calls %j with the provided label followed by a single argument',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const testLogger = makeLogger('test');
      testLogger[method]('foo');
      expect(methodSpy).toHaveBeenCalledWith('test', 'foo');
    },
  );

  it.each(consoleMethod)(
    'calls %j with the provided label followed by multiple arguments',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const testLogger = makeLogger('test');
      testLogger[method]('foo', { bar: 'bar' });
      expect(methodSpy).toHaveBeenCalledWith('test', 'foo', { bar: 'bar' });
    },
  );

  it.each(consoleMethod)(
    'calls %j with the provided label when given no argument',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const testLogger = makeLogger('test');
      testLogger[method]();
      expect(methodSpy).toHaveBeenCalledWith('test');
    },
  );

  it('can be nested', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const vatLogger = makeLogger('[vat 0x01]');
    const subLogger = makeLogger('(process)', vatLogger);
    subLogger.log('foo');
    expect(consoleSpy).toHaveBeenCalledWith('[vat 0x01]', '(process)', 'foo');
  });
});
