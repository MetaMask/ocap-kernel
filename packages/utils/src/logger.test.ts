import { describe, it, expect, vi } from 'vitest';

import { DEFAULT_LEVEL, makeLogger } from './logger.ts';
import type { Logger, LoggerContext } from './logger.ts';

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

  it('uses the provided transports', () => {
    const noOpTransport = vi.fn();
    const testLogger = makeLogger('test', console, [noOpTransport]);
    testLogger.log('foo');
    expect(noOpTransport).toHaveBeenCalledWith(
      { level: 'log', tags: ['test'] },
      'foo',
    );
  });

  it('logs transport errors to console.error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');
    const error = new Error('transport error');
    const errorTransport = vi.fn().mockImplementation(() => {
      throw error;
    });
    const testLogger = makeLogger('test', console, [errorTransport]);
    testLogger.log('foo');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/dispatch failed/u),
      error,
    );
  });

  type TestLogger = Logger & {
    dispatch: (context: LoggerContext, ...args: unknown[]) => void;
  };

  it('does not output to console when silent', async () => {
    const consoleMethodSpys = consoleMethod.map((method) =>
      vi.spyOn(console, method),
    );
    const testLogger = makeLogger('test') as TestLogger;
    testLogger.dispatch({ level: 'silent' }, 'foo');
    for (const spy of consoleMethodSpys) {
      expect(spy.mock.calls).toHaveLength(0);
    }
  });

  it(`logs to ${DEFAULT_LEVEL} by default`, async () => {
    const consoleMethodSpy = vi.spyOn(console, DEFAULT_LEVEL as keyof Console);
    const testLogger = makeLogger('test') as TestLogger;
    testLogger.dispatch({ tags: ['test'] }, 'foo');
    expect(consoleMethodSpy).toHaveBeenCalledWith('test', 'foo');
  });
});
