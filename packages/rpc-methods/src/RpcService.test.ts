import { number, string, tuple } from '@metamask/superstruct';
import { describe, it, expect } from 'vitest';

import { RpcService } from './RpcService.ts';
import type { Handler } from './RpcService.ts';

const getHooks = () =>
  ({
    hook1: () => undefined,
    hook2: () => undefined,
    hook3: () => undefined,
  }) as const;

type Hooks = ReturnType<typeof getHooks>;

const getHandlers = () =>
  ({
    method1: {
      method: 'method1',
      implementation: () => null,
      params: tuple([string()]),
      hooks: ['hook1', 'hook2'] as const,
    } as Handler<Hooks, 'method1', [string], null>,
    method2: {
      method: 'method2',
      implementation: (hooks, [value]) => {
        hooks.hook3();
        return value * 2;
      },
      params: tuple([number()]),
      hooks: ['hook3'] as const,
    } as Handler<Hooks, 'method2', [number], number>,
  }) as const;

describe('RpcService', () => {
  describe('constructor', () => {
    it('should construct an instance', () => {
      expect(new RpcService(getHandlers(), getHooks())).toBeInstanceOf(
        RpcService,
      );
    });
  });

  describe('assertHasMethod', () => {
    it('should not throw if the method is found', () => {
      const service = new RpcService(getHandlers(), getHooks());
      expect(() => service.assertHasMethod('method1')).not.toThrow();
    });

    it('should throw if the method is not found', () => {
      const service = new RpcService(getHandlers(), getHooks());
      expect(() => service.assertHasMethod('method3')).toThrow(
        'Method "method3" not found in registry.',
      );
    });
  });

  describe('execute', () => {
    it('should be able to execute a method', () => {
      const service = new RpcService(getHandlers(), getHooks());
      expect(service.execute('method1', ['test'])).toBeNull();
    });

    it('should be able to execute a method that uses a hook', () => {
      const service = new RpcService(getHandlers(), getHooks());
      expect(service.execute('method2', [2])).toBe(4);
    });

    it('should throw an error if the method is not found', () => {
      const service = new RpcService(getHandlers(), getHooks());
      // @ts-expect-error Intentional destructive testing
      expect(() => service.execute('method3', [2])).not.toThrow(
        // This is not a _good_ error, but we only care about type safety in this instance.
        'TypeError: Cannot read properties of undefined (reading "params")',
      );
    });

    it('should throw if passed invalid params', () => {
      const service = new RpcService(getHandlers(), getHooks());
      expect(() => service.execute('method1', [2])).toThrow('Invalid params');
    });
  });
});
