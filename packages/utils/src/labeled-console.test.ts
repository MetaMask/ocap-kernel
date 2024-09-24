import { describe, it, expect, vi } from 'vitest';

import { makeLabeledConsole } from './labeled-console.js';

describe('makeLabeledConsole', () => {
  const consoleMethod = ['log', 'debug', 'info', 'warn', 'error'] as const;

  it.each(consoleMethod)('has method %j', (method) => {
    const testConsole = makeLabeledConsole('test');
    expect(testConsole).toHaveProperty(method);
    expect(testConsole[method]).toBeTypeOf('function');
  });

  it.each(consoleMethod)(
    'calls %j with the provided label followed by a single argument',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const testConsole = makeLabeledConsole('test');
      console.log(testConsole);
      testConsole[method]('foo');
      expect(methodSpy).toHaveBeenCalledWith('test', 'foo');
    },
  );

  it.each(consoleMethod)(
    'calls %j with the provided label followed by multiple arguments',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const testConsole = makeLabeledConsole('test');
      console.log(testConsole);
      testConsole[method]('foo', { bar: 'bar' });
      expect(methodSpy).toHaveBeenCalledWith('test', 'foo', { bar: 'bar' });
    },
  );

  it.each(consoleMethod)(
    'calls %j with the provided label when given no argument',
    (method) => {
      const methodSpy = vi.spyOn(console, method);
      const testConsole = makeLabeledConsole('test');
      console.log(testConsole);
      testConsole[method]();
      expect(methodSpy).toHaveBeenCalledWith('test');
    },
  );

  it('can be nested', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const vatConsole = makeLabeledConsole('[vat 0x01]');
    const subConsole = makeLabeledConsole('(process)', vatConsole);
    subConsole.log('foo');
    expect(consoleSpy).toHaveBeenCalledWith('[vat 0x01]', '(process)', 'foo');
  });
});
