import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  isConsoleForwardMessage,
  stringifyConsoleArg,
  setupConsoleForwarding,
  setupPostMessageConsoleForwarding,
  handleConsoleForwardMessage,
} from './console-forwarding.ts';
import type { ConsoleForwardMessage } from './console-forwarding.ts';

// Mock harden to do nothing since we're not in SES
vi.stubGlobal(
  'harden',
  vi.fn((obj: unknown) => obj),
);

describe('console-forwarding', () => {
  describe('isConsoleForwardMessage', () => {
    it('returns true for valid console-forward message', () => {
      const message: ConsoleForwardMessage = {
        jsonrpc: '2.0',
        method: 'console-forward',
        params: {
          source: 'offscreen',
          method: 'log',
          args: ['test'],
        },
      };
      expect(isConsoleForwardMessage(message)).toBe(true);
    });

    it.each([
      { name: 'null', value: null },
      { name: 'undefined', value: undefined },
      { name: 'string', value: 'test' },
      { name: 'number', value: 123 },
      { name: 'array', value: [] },
      { name: 'object without method', value: { jsonrpc: '2.0' } },
      { name: 'object with different method', value: { method: 'other' } },
    ])('returns false for $name', ({ value }) => {
      expect(isConsoleForwardMessage(value)).toBe(false);
    });
  });

  describe('stringifyConsoleArg', () => {
    it.each([
      { name: 'string', input: 'hello', expected: 'hello' },
      { name: 'number', input: 42, expected: '42' },
      { name: 'boolean true', input: true, expected: 'true' },
      { name: 'boolean false', input: false, expected: 'false' },
      { name: 'null', input: null, expected: 'null' },
      { name: 'undefined', input: undefined, expected: 'undefined' },
      { name: 'object', input: { foo: 'bar' }, expected: '{"foo":"bar"}' },
      { name: 'array', input: [1, 2, 3], expected: '[1,2,3]' },
      {
        name: 'nested object',
        input: { a: { b: 1 } },
        expected: '{"a":{"b":1}}',
      },
    ])('stringifies $name correctly', ({ input, expected }) => {
      expect(stringifyConsoleArg(input)).toBe(expected);
    });
  });

  describe('setupConsoleForwarding', () => {
    let originalConsole: typeof console;
    let mockStream: {
      write: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      originalConsole = { ...console };
      mockStream = {
        write: vi.fn().mockResolvedValue(undefined),
      };
    });

    afterEach(() => {
      // Restore original console methods
      Object.assign(console, originalConsole);
    });

    it('wraps all console methods', () => {
      setupConsoleForwarding(mockStream as never, 'test-source');

      const methods = ['log', 'debug', 'info', 'warn', 'error'] as const;
      for (const method of methods) {
        expect(console[method]).not.toBe(originalConsole[method]);
      }
    });

    it.each(['log', 'debug', 'info', 'warn', 'error'] as const)(
      'forwards %s method to stream with source',
      (method) => {
        setupConsoleForwarding(mockStream as never, 'test-source');

        console[method]('test message', 123);

        expect(mockStream.write).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          method: 'console-forward',
          params: {
            source: 'test-source',
            method,
            args: ['test message', '123'],
          },
        });
      },
    );

    it('calls original console method', () => {
      // Spy on console.log BEFORE setupConsoleForwarding captures it
      const originalLog = vi.spyOn(console, 'log');
      setupConsoleForwarding(mockStream as never, 'test-source');

      console.log('test');

      expect(originalLog).toHaveBeenCalledWith('test');
      originalLog.mockRestore();
    });

    it('ignores stream write errors', async () => {
      mockStream.write.mockRejectedValue(new Error('Stream not ready'));
      setupConsoleForwarding(mockStream as never, 'test-source');

      // Should not throw

      expect(() => console.log('test')).not.toThrow();
    });
  });

  describe('handleConsoleForwardMessage', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      consoleSpy?.mockRestore();
    });

    it.each(['log', 'debug', 'info', 'warn', 'error'] as const)(
      'calls console.%s with source prefix and args',
      (method) => {
        consoleSpy = vi
          .spyOn(console, method)
          .mockImplementation(() => undefined);

        const message: ConsoleForwardMessage = {
          jsonrpc: '2.0',
          method: 'console-forward',
          params: {
            source: 'offscreen',
            method,
            args: ['arg1', 'arg2'],
          },
        };

        handleConsoleForwardMessage(message);

        expect(consoleSpy).toHaveBeenCalledWith('[offscreen]', 'arg1', 'arg2');
      },
    );

    it('uses source from message for prefix', () => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const message: ConsoleForwardMessage = {
        jsonrpc: '2.0',
        method: 'console-forward',
        params: {
          source: 'kernel-worker',
          method: 'log',
          args: ['test'],
        },
      };

      handleConsoleForwardMessage(message);

      expect(consoleSpy).toHaveBeenCalledWith('[kernel-worker]', 'test');
    });

    it('handles vat source prefixes', () => {
      consoleSpy = vi
        .spyOn(console, 'info')
        .mockImplementation(() => undefined);

      const message: ConsoleForwardMessage = {
        jsonrpc: '2.0',
        method: 'console-forward',
        params: {
          source: 'vat-v1',
          method: 'info',
          args: ['vat message'],
        },
      };

      handleConsoleForwardMessage(message);

      expect(consoleSpy).toHaveBeenCalledWith('[vat-v1]', 'vat message');
    });
  });

  describe('setupPostMessageConsoleForwarding', () => {
    let originalConsole: typeof console;
    let mockPostMessage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalConsole = { ...console };
      mockPostMessage = vi.fn();
      vi.stubGlobal('window', {
        parent: {
          postMessage: mockPostMessage,
        },
      });
    });

    afterEach(() => {
      // Restore original console methods
      Object.assign(console, originalConsole);
      vi.unstubAllGlobals();
      // Re-stub harden since unstubAllGlobals removes it
      vi.stubGlobal(
        'harden',
        vi.fn((obj: unknown) => obj),
      );
    });

    it('wraps all console methods', () => {
      setupPostMessageConsoleForwarding('vat-v1');

      const methods = ['log', 'debug', 'info', 'warn', 'error'] as const;
      for (const method of methods) {
        expect(console[method]).not.toBe(originalConsole[method]);
      }
    });

    it.each(['log', 'debug', 'info', 'warn', 'error'] as const)(
      'posts %s method to parent window with standard message format',
      (method) => {
        setupPostMessageConsoleForwarding('vat-v1');

        console[method]('test message', 123);

        expect(mockPostMessage).toHaveBeenCalledWith(
          {
            jsonrpc: '2.0',
            method: 'console-forward',
            params: {
              source: 'vat-v1',
              method,
              args: ['test message', '123'],
            },
          },
          '*',
        );
      },
    );

    it('sends messages that pass isConsoleForwardMessage check', () => {
      setupPostMessageConsoleForwarding('vat-v1');

      console.log('test');

      const sentMessage = mockPostMessage.mock.calls[0][0];
      expect(isConsoleForwardMessage(sentMessage)).toBe(true);
    });

    it('calls original console method', () => {
      // Spy on console.log BEFORE setupPostMessageConsoleForwarding captures it
      const originalLog = vi.spyOn(console, 'log');
      setupPostMessageConsoleForwarding('vat-v1');

      console.log('test');

      expect(originalLog).toHaveBeenCalledWith('test');
      originalLog.mockRestore();
    });
  });
});
