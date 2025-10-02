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
    kernelStore = makeKernelStore(kernelDatabase);
    logger = new Logger('test');

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
    it('should register a kernel service and return service info', () => {
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

    it('should pin the service object in kernel store', () => {
      // Use a plain object instead of Far for testing
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      // Check that the object is pinned (we can't spy on the frozen kernelStore.pinObject)
      // Instead, we verify the kref format which indicates it was created
      expect(registered.kref).toMatch(/^ko\d+$/u);
    });

    it('should allow registering multiple services', () => {
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
    it('should retrieve registered service by name', () => {
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

    it('should return undefined for non-existent service', () => {
      const retrieved = serviceManager.getKernelService('nonExistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getKernelServiceByKref', () => {
    it('should retrieve registered service by kref', () => {
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

    it('should return undefined for non-existent kref', () => {
      const retrieved = serviceManager.getKernelServiceByKref('ko999');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('isKernelService', () => {
    it('should return true for registered service kref', () => {
      const testService = {
        testMethod: () => 'test result',
      };

      const registered = serviceManager.registerKernelServiceObject(
        'testService',
        testService,
      );

      expect(serviceManager.isKernelService(registered.kref)).toBe(true);
    });

    it('should return false for non-service kref', () => {
      expect(serviceManager.isKernelService('ko999')).toBe(false);
    });
  });

  describe('invokeKernelService', () => {
    it('should successfully invoke a service method without result', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(testMethod).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });

    it('should successfully invoke a service method with result', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(testMethod).toHaveBeenCalledWith('arg1');
      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', false, kser('test result')],
      ]);
    });

    it('should handle errors when invoking service method with result', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(testError)],
      ]);
    });

    it('should handle errors when invoking service method without result', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Error in kernel service method:',
        testError,
      );
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });

    it('should throw error for non-existent service', async () => {
      const message: Message = {
        methargs: kser(['testMethod', []]),
      };

      await expect(
        serviceManager.invokeKernelService('ko999', message),
      ).rejects.toThrow('No registered service for ko999');
    });

    it('should handle unknown method with result', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(Error("unknown service method 'unknownMethod'"))],
      ]);
    });

    it('should handle unknown method without result', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "unknown service method 'unknownMethod'",
      );
      expect(mockKernelQueue.resolvePromises).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle service with no methods', async () => {
      const emptyService = {};

      const registered = serviceManager.registerKernelServiceObject(
        'emptyService',
        emptyService,
      );

      const message: Message = {
        methargs: kser(['anyMethod', []]),
        result: 'kp123',
      };

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', true, kser(Error("unknown service method 'anyMethod'"))],
      ]);
    });

    it('should handle service method that returns undefined', async () => {
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

      await serviceManager.invokeKernelService(registered.kref, message);

      expect(mockKernelQueue.resolvePromises).toHaveBeenCalledWith('kernel', [
        ['kp123', false, kser(undefined)],
      ]);
    });
  });
});
