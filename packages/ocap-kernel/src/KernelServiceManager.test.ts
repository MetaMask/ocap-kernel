import { delay } from '@metamask/kernel-utils';
import { Logger } from '@metamask/logger';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { KernelQueue } from './KernelQueue.ts';
import { KernelServiceManager } from './KernelServiceManager.ts';
import { kser } from './liveslots/kernel-marshal.ts';
import { makeKernelStore } from './store/index.ts';
import type { Message } from './types.ts';
import { makeMapKernelDatabase } from '../test/storage.ts';

describe('KernelServiceManager', () => {
  let serviceManager: KernelServiceManager;
  let kernelStore: ReturnType<typeof makeKernelStore>;
  let mockKernelQueue: KernelQueue;
  let logger: Logger;

  beforeEach(() => {
    const kernelDatabase = makeMapKernelDatabase();
    const realKernelStore = makeKernelStore(kernelDatabase);
    logger = new Logger('test');

    // Create a mock kernelStore with spyable methods
    kernelStore = {
      ...realKernelStore,
      pinObject: vi.fn().mockImplementation(realKernelStore.pinObject),
      initKernelObject: vi
        .fn()
        .mockImplementation(realKernelStore.initKernelObject),
      kv: realKernelStore.kv,
    };

    mockKernelQueue = {
      enqueueMessage: vi.fn(),
      resolvePromises: vi.fn(),
      waitForCrank: vi.fn(),
      run: vi.fn(),
    } as unknown as KernelQueue;

    serviceManager = new KernelServiceManager({
      kernelStore,
      kernelQueue: mockKernelQueue,
      logger,
    });
  });

  describe('registerKernelServiceObject', () => {
    it('registers a kernel service and return service info', () => {
      // Use a plain object instead of Far for testing
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      expect(registered.name).toBe('testService');
      expect(registered.kref).toMatch(/^ko\d+$/u);
      expect(registered.service).toBe(testService);
      expect(registered.systemOnly).toBe(false);
    });

    it('defaults systemOnly to false when no options provided', () => {
      const testService = { testMethod: () => 'test' };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      expect(registered.systemOnly).toBe(false);
    });

    it('sets systemOnly to true when specified', () => {
      const testService = { testMethod: () => 'test' };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
        { systemOnly: true },
      );

      expect(registered.systemOnly).toBe(true);
    });

    it('pins the service object in kernel store', () => {
      // Use a plain object instead of Far for testing
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      // Verify that initKernelObject and pinObject were called
      expect(kernelStore.initKernelObject).toHaveBeenCalledWith('kernel');
      expect(kernelStore.pinObject).toHaveBeenCalledWith(registered.kref);
      expect(registered.kref).toMatch(/^ko\d+$/u);
    });

    it('allows registering multiple services', () => {
      const service1 = { method1: () => 'result1' };
      const service2 = { method2: () => 'result2' };

      const registered1 = serviceManager.registerKernelServiceObject(
        'service1',
        service1,
      );
      const registered2 = serviceManager.registerKernelServiceObject(
        'service2',
        service2,
      );

      expect(registered1.kref).not.toBe(registered2.kref);
      expect(registered1.name).toBe('service1');
      expect(registered2.name).toBe('service2');
    });

    it('throws when registering a service with a name that is already registered', () => {
      const service1 = { method1: () => 'result1' };
      const service2 = { method2: () => 'result2' };

      serviceManager.registerKernelServiceObject('duplicateName', service1);

      expect(() =>
        serviceManager.registerKernelServiceObject('duplicateName', service2),
      ).toThrow('Kernel service "duplicateName" is already registered');
    });
  });

  describe('unregisterKernelServiceObject', () => {
    it('removes a registered service', () => {
      const testService = { testMethod: () => 'test' };
      serviceManager.registerKernelServiceObject('myService', testService);

      serviceManager.unregisterKernelServiceObject('myService');

      expect(serviceManager.getKernelService('myService')).toBeUndefined();
    });

    it('removes from kref lookup', () => {
      const testService = { testMethod: () => 'test' };
      const registered = serviceManager.registerKernelServiceObject(
        'myService',
        testService,
      );

      serviceManager.unregisterKernelServiceObject('myService');

      expect(
        serviceManager.getKernelServiceByKref(registered.kref),
      ).toBeUndefined();
      expect(serviceManager.isKernelService(registered.kref)).toBe(false);
    });

    it('unpins the object and deletes the KV key', () => {
      const testService = { testMethod: () => 'test' };
      const registered = serviceManager.registerKernelServiceObject(
        'myService',
        testService,
      );

      serviceManager.unregisterKernelServiceObject('myService');

      expect(kernelStore.kv.get('kernelService.myService')).toBeUndefined();
      // Verify it was unpinned by trying to re-register with the same name
      const reregistered = serviceManager.registerKernelServiceObject(
        'myService',
        testService,
      );
      expect(reregistered.kref).not.toBe(registered.kref);
    });

    it('is a no-op for non-existent service', () => {
      expect(() =>
        serviceManager.unregisterKernelServiceObject('nonexistent'),
      ).not.toThrow();
    });

    it('allows re-registration after unregister', () => {
      const service1 = { method: () => 'v1' };
      const service2 = { method: () => 'v2' };

      serviceManager.registerKernelServiceObject('svc', service1);
      serviceManager.unregisterKernelServiceObject('svc');
      const registered = serviceManager.registerKernelServiceObject(
        'svc',
        service2,
      );

      expect(registered.service).toBe(service2);
      expect(serviceManager.getKernelService('svc')?.service).toBe(service2);
    });
  });

  describe('getKernelService', () => {
    it('retrieves registered service by name', () => {
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const retrieved = serviceManager.getKernelService('testService');
      expect(retrieved).toStrictEqual(registered);
    });

    it('returns the systemOnly flag on retrieved service', () => {
      const testService = { testMethod: () => 'test' };

      serviceManager.registerKernelServiceObject('sysOnly', testService, {
        systemOnly: true,
      });
      serviceManager.registerKernelServiceObject('open', testService);

      expect(serviceManager.getKernelService('sysOnly')?.systemOnly).toBe(true);
      expect(serviceManager.getKernelService('open')?.systemOnly).toBe(false);
    });

    it('returns undefined for non-existent service', () => {
      const retrieved = serviceManager.getKernelService('nonExistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getKernelServiceByKref', () => {
    it('retrieves registered service by kref', () => {
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const retrieved = serviceManager.getKernelServiceByKref(registered.kref);
      expect(retrieved).toStrictEqual(registered);
    });

    it('returns undefined for non-existent kref', () => {
      const retrieved = serviceManager.getKernelServiceByKref('ko999');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('isKernelService', () => {
    it('returns true for registered service kref', () => {
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      expect(serviceManager.isKernelService(registered.kref)).toBe(true);
    });

    it('returns false for non-service kref', () => {
      expect(serviceManager.isKernelService('ko999')).toBe(false);
    });
  });

  describe('invokeKernelService', () => {
    it('successfully invokes a service method without result', async () => {
      const testMethod = vi.fn().mockReturnValue('test result');
      const testService = {
        testMethod,
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['testMethod', ['arg1', 'arg2']]),
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(testMethod).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });

    it('successfully invokes a service method with result', async () => {
      const testMethod = vi.fn().mockResolvedValue('test result');
      const testService = {
        testMethod,
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['testMethod', ['arg1']]),
        result: 'kp123',
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(testMethod).toHaveBeenCalledWith('arg1');
      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', false, kser('test result')],
      ]);
    });

    it('handles errors when invoking service method with result', async () => {
      const testError = new Error('Test error');
      const testMethod = vi.fn().mockRejectedValue(testError);
      const testService = {
        testMethod,
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['testMethod', []]),
        result: 'kp123',
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(testError)],
      ]);
    });

    it('handles errors when invoking service method without result', async () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const testError = new Error('Test error');
      const testMethod = vi.fn().mockRejectedValue(testError);
      const testService = {
        testMethod,
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['testMethod', []]),
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error in kernel service method:',
        testError,
      );
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });

    it('throws error for non-existent service', () => {
      const message: Message = {
        methargs: kser(['testMethod', []]),
      };

      expect(() =>
        serviceManager.invokeKernelService('ko999', message),
      ).toThrow('No registered service for ko999');
    });

    it('handles unknown method with result', async () => {
      const testService = {
        existingMethod: () => 'test',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['unknownMethod', []]),
        result: 'kp123',
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(Error("unknown service method 'unknownMethod'"))],
      ]);
    });

    it('handles unknown method without result', async () => {
      const loggerErrorSpy = vi.spyOn(logger, 'error');
      const testService = {
        existingMethod: () => 'test',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['unknownMethod', []]),
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "unknown service method 'unknownMethod'",
      );
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });

    it('handles service with no methods', async () => {
      const emptyService = {};

      const registered = serviceManager.registerKernelServiceObject(
        'emptyService',
        emptyService,
      );

      const message: Message = {
        methargs: kser(['anyMethod', []]),
        result: 'kp123',
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(Error("unknown service method 'anyMethod'"))],
      ]);
    });

    it('handles service method that returns undefined', async () => {
      const testService = {
        voidMethod: () => undefined,
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['voidMethod', []]),
        result: 'kp123',
      };

      serviceManager.invokeKernelService(registered.kref, message);
      await delay();

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', false, kser(undefined)],
      ]);
    });
  });
});
