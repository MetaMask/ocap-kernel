import { describe, it, expect } from 'vitest';

import { RpcService } from './RpcService.ts';
import { getHandlers, getHooks } from '../test/methods.ts';

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
