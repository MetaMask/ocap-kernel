import { describe, it, expect } from 'vitest';

import { kernelRemoteHandlers, kernelRemoteMethodSpecs } from './index.ts';
import type { KernelRemoteMethod } from './index.ts';

describe('kernel-remote index', () => {
  describe('kernelRemoteHandlers', () => {
    it('should export remoteDeliver handler', () => {
      expect(kernelRemoteHandlers).toHaveProperty('remoteDeliver');
      expect(kernelRemoteHandlers.remoteDeliver).toBeDefined();
    });

    it('should export remoteGiveUp handler', () => {
      expect(kernelRemoteHandlers).toHaveProperty('remoteGiveUp');
      expect(kernelRemoteHandlers.remoteGiveUp).toBeDefined();
    });

    it('should have correct handler structure for remoteDeliver', () => {
      const handler = kernelRemoteHandlers.remoteDeliver;

      expect(handler).toHaveProperty('method', 'remoteDeliver');
      expect(handler).toHaveProperty('params');
      expect(handler).toHaveProperty('result');
      expect(handler).toHaveProperty('hooks');
      expect(handler).toHaveProperty('implementation');
    });

    it('should have correct handler structure for remoteGiveUp', () => {
      const handler = kernelRemoteHandlers.remoteGiveUp;

      expect(handler).toHaveProperty('method', 'remoteGiveUp');
      expect(handler).toHaveProperty('params');
      expect(handler).toHaveProperty('result');
      expect(handler).toHaveProperty('hooks');
      expect(handler).toHaveProperty('implementation');
    });

    it('should have correct hooks configuration for remoteDeliver', () => {
      const handler = kernelRemoteHandlers.remoteDeliver;

      expect(handler.hooks).toStrictEqual({
        remoteDeliver: true,
      });
    });

    it('should have correct hooks configuration for remoteGiveUp', () => {
      const handler = kernelRemoteHandlers.remoteGiveUp;

      expect(handler.hooks).toStrictEqual({
        remoteGiveUp: true,
      });
    });

    it('should have implementation as a function for remoteDeliver', () => {
      const handler = kernelRemoteHandlers.remoteDeliver;

      expect(typeof handler.implementation).toBe('function');
    });

    it('should have implementation as a function for remoteGiveUp', () => {
      const handler = kernelRemoteHandlers.remoteGiveUp;

      expect(typeof handler.implementation).toBe('function');
    });
  });

  describe('kernelRemoteMethodSpecs', () => {
    it('should export remoteDeliver method spec', () => {
      expect(kernelRemoteMethodSpecs).toHaveProperty('remoteDeliver');
      expect(kernelRemoteMethodSpecs.remoteDeliver).toBeDefined();
    });

    it('should export remoteGiveUp method spec', () => {
      expect(kernelRemoteMethodSpecs).toHaveProperty('remoteGiveUp');
      expect(kernelRemoteMethodSpecs.remoteGiveUp).toBeDefined();
    });

    it('should have correct method spec structure for remoteDeliver', () => {
      const spec = kernelRemoteMethodSpecs.remoteDeliver;

      expect(spec).toHaveProperty('method', 'remoteDeliver');
      expect(spec).toHaveProperty('params');
      expect(spec).toHaveProperty('result');
    });

    it('should have correct method spec structure for remoteGiveUp', () => {
      const spec = kernelRemoteMethodSpecs.remoteGiveUp;

      expect(spec).toHaveProperty('method', 'remoteGiveUp');
      expect(spec).toHaveProperty('params');
      expect(spec).toHaveProperty('result');
    });

    it('should match the handler method name for remoteDeliver', () => {
      const handler = kernelRemoteHandlers.remoteDeliver;
      const spec = kernelRemoteMethodSpecs.remoteDeliver;

      expect(handler.method).toBe(spec.method);
    });

    it('should match the handler method name for remoteGiveUp', () => {
      const handler = kernelRemoteHandlers.remoteGiveUp;
      const spec = kernelRemoteMethodSpecs.remoteGiveUp;

      expect(handler.method).toBe(spec.method);
    });
  });

  describe('KernelRemoteMethod type', () => {
    it('should include remoteDeliver method', () => {
      // This test verifies that the type is correctly inferred
      const method: KernelRemoteMethod = 'remoteDeliver';
      expect(method).toBe('remoteDeliver');
    });

    it('should include remoteGiveUp method', () => {
      // This test verifies that the type is correctly inferred
      const method: KernelRemoteMethod = 'remoteGiveUp';
      expect(method).toBe('remoteGiveUp');
    });
  });

  describe('module consistency', () => {
    it('should have matching keys between handlers and specs', () => {
      const handlerKeys = Object.keys(kernelRemoteHandlers);
      const specKeys = Object.keys(kernelRemoteMethodSpecs);

      expect(handlerKeys).toStrictEqual(specKeys);
    });

    it('should have handlers and specs with matching method names', () => {
      const handlerKeys = Object.keys(
        kernelRemoteHandlers,
      ) as (keyof typeof kernelRemoteHandlers)[];

      for (const key of handlerKeys) {
        const handler = kernelRemoteHandlers[key];
        const spec = kernelRemoteMethodSpecs[key];

        expect(handler.method).toBe(spec.method);
      }
    });
  });
});
