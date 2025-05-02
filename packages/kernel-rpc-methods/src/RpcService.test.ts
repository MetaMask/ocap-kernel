import { describe, it, expect, vi } from 'vitest';

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
      expect(() => service.assertHasMethod('does-not-exist')).toThrow(
        'The method does not exist / is not available.',
      );
    });
  });

  describe('execute', () => {
    it('should execute a method', async () => {
      const hooks = getHooks();
      const hookSpy = vi.spyOn(hooks, 'hook1');
      const service = new RpcService(getHandlers(), hooks);
      expect(await service.execute('method1', ['test'])).toBeNull();
      expect(hookSpy).toHaveBeenCalledOnce();
    });

    it('should execute a notification method', async () => {
      const hooks = getHooks();
      const hookSpy = vi.spyOn(hooks, 'hook4');
      const service = new RpcService(getHandlers(), hooks);
      expect(await service.execute('method3', ['test'])).toBeUndefined();
      expect(hookSpy).toHaveBeenCalledOnce();
      expect(hookSpy).toHaveBeenCalledWith('test');
    });

    it('should be able to execute a method that uses a hook', async () => {
      const service = new RpcService(getHandlers(), getHooks());
      expect(await service.execute('method2', [2])).toBe(4);
    });

    it('should throw an error if the method is not found', async () => {
      const service = new RpcService(getHandlers(), getHooks());
      // @ts-expect-error Intentional destructive testing
      await expect(service.execute('does-not-exist', [2])).rejects.toThrow(
        // This is not a _good_ error, but we only care about type safety in this instance.
        "Cannot read properties of undefined (reading 'params')",
      );
    });

    it('should throw if passed invalid params', async () => {
      const service = new RpcService(getHandlers(), getHooks());
      await expect(service.execute('method1', [2])).rejects.toThrow(
        'Invalid params',
      );
    });
  });
});
