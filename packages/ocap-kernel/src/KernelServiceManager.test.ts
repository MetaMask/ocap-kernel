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

    it('handles unknown method with result', () => {
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

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(Error("unknown service method 'unknownMethod'"))],
      ]);
    });

    it('handles unknown method without result', () => {
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

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "unknown service method 'unknownMethod'",
      );
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });

    it('handles service with no methods', () => {
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

    it('handles synchronous errors thrown by service method', () => {
      const testError = new Error('Sync error');
      const testService = {
        throwingMethod: () => {
          throw testError;
        },
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      const message: Message = {
        methargs: kser(['throwingMethod', []]),
        result: 'kp123',
      };

      serviceManager.invokeKernelService(registered.kref, message);

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(testError)],
      ]);
    });
  });
});
