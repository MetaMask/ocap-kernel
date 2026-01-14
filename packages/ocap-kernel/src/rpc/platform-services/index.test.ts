import { describe, it, expect } from 'vitest';

import {
  platformServicesHandlers,
  platformServicesMethodSpecs,
} from './index.ts';
import type { PlatformServicesMethod } from './index.ts';

describe('platform-services index', () => {
  describe('platformServicesHandlers', () => {
    it('should export all expected handlers', () => {
      const expectedHandlers = [
        'launch',
        'terminate',
        'terminateAll',
        'sendRemoteMessage',
        'initializeRemoteComms',
        'stopRemoteComms',
        'closeConnection',
        'registerLocationHints',
        'reconnectPeer',
        'handleAck',
        'updateReceivedSeq',
      ];

      for (const handlerName of expectedHandlers) {
        expect(platformServicesHandlers).toHaveProperty(handlerName);
        expect(
          platformServicesHandlers[
            handlerName as keyof typeof platformServicesHandlers
          ],
        ).toBeDefined();
      }
    });

    it('should have handlers with correct structure', () => {
      const handlerKeys = Object.keys(
        platformServicesHandlers,
      ) as (keyof typeof platformServicesHandlers)[];

      for (const key of handlerKeys) {
        const handler = platformServicesHandlers[key];

        expect(handler).toHaveProperty('method');
        expect(handler).toHaveProperty('params');
        expect(handler).toHaveProperty('result');
        expect(handler).toHaveProperty('hooks');
        expect(handler).toHaveProperty('implementation');

        expect(typeof handler.method).toBe('string');
        expect(typeof handler.implementation).toBe('function');
        expect(typeof handler.hooks).toBe('object');
      }
    });

    describe('individual handlers', () => {
      it('should have launch handler with correct configuration', () => {
        const handler = platformServicesHandlers.launch;

        expect(handler.method).toBe('launch');
        expect(handler.hooks).toStrictEqual({ launch: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have terminate handler with correct configuration', () => {
        const handler = platformServicesHandlers.terminate;

        expect(handler.method).toBe('terminate');
        expect(handler.hooks).toStrictEqual({ terminate: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have terminateAll handler with correct configuration', () => {
        const handler = platformServicesHandlers.terminateAll;

        expect(handler.method).toBe('terminateAll');
        expect(handler.hooks).toStrictEqual({ terminateAll: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have sendRemoteMessage handler with correct configuration', () => {
        const handler = platformServicesHandlers.sendRemoteMessage;

        expect(handler.method).toBe('sendRemoteMessage');
        expect(handler.hooks).toStrictEqual({ sendRemoteMessage: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have initializeRemoteComms handler with correct configuration', () => {
        const handler = platformServicesHandlers.initializeRemoteComms;

        expect(handler.method).toBe('initializeRemoteComms');
        expect(handler.hooks).toStrictEqual({ initializeRemoteComms: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have stopRemoteComms handler with correct configuration', () => {
        const handler = platformServicesHandlers.stopRemoteComms;

        expect(handler.method).toBe('stopRemoteComms');
        expect(handler.hooks).toStrictEqual({ stopRemoteComms: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have closeConnection handler with correct configuration', () => {
        const handler = platformServicesHandlers.closeConnection;

        expect(handler.method).toBe('closeConnection');
        expect(handler.hooks).toStrictEqual({ closeConnection: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have registerLocationHints handler with correct configuration', () => {
        const handler = platformServicesHandlers.registerLocationHints;

        expect(handler.method).toBe('registerLocationHints');
        expect(handler.hooks).toStrictEqual({ registerLocationHints: true });
        expect(typeof handler.implementation).toBe('function');
      });

      it('should have reconnectPeer handler with correct configuration', () => {
        const handler = platformServicesHandlers.reconnectPeer;

        expect(handler.method).toBe('reconnectPeer');
        expect(handler.hooks).toStrictEqual({ reconnectPeer: true });
        expect(typeof handler.implementation).toBe('function');
      });
    });
  });

  describe('platformServicesMethodSpecs', () => {
    it('should export all expected method specs', () => {
      const expectedSpecs = [
        'launch',
        'terminate',
        'terminateAll',
        'sendRemoteMessage',
        'initializeRemoteComms',
        'stopRemoteComms',
        'closeConnection',
        'registerLocationHints',
        'reconnectPeer',
      ];

      for (const specName of expectedSpecs) {
        expect(platformServicesMethodSpecs).toHaveProperty(specName);
        expect(
          platformServicesMethodSpecs[
            specName as keyof typeof platformServicesMethodSpecs
          ],
        ).toBeDefined();
      }
    });

    it('should have method specs with correct structure', () => {
      const specKeys = Object.keys(
        platformServicesMethodSpecs,
      ) as (keyof typeof platformServicesMethodSpecs)[];

      for (const key of specKeys) {
        const spec = platformServicesMethodSpecs[key];

        expect(spec).toHaveProperty('method');
        expect(spec).toHaveProperty('params');
        expect(spec).toHaveProperty('result');

        expect(typeof spec.method).toBe('string');
      }
    });

    describe('individual method specs', () => {
      it('should have launch spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.launch;
        expect(spec.method).toBe('launch');
      });

      it('should have terminate spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.terminate;
        expect(spec.method).toBe('terminate');
      });

      it('should have terminateAll spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.terminateAll;
        expect(spec.method).toBe('terminateAll');
      });

      it('should have sendRemoteMessage spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.sendRemoteMessage;
        expect(spec.method).toBe('sendRemoteMessage');
      });

      it('should have initializeRemoteComms spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.initializeRemoteComms;
        expect(spec.method).toBe('initializeRemoteComms');
      });

      it('should have stopRemoteComms spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.stopRemoteComms;
        expect(spec.method).toBe('stopRemoteComms');
      });

      it('should have closeConnection spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.closeConnection;
        expect(spec.method).toBe('closeConnection');
      });

      it('should have registerLocationHints spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.registerLocationHints;
        expect(spec.method).toBe('registerLocationHints');
      });

      it('should have reconnectPeer spec with correct method name', () => {
        const spec = platformServicesMethodSpecs.reconnectPeer;
        expect(spec.method).toBe('reconnectPeer');
      });
    });
  });

  describe('PlatformServicesMethod type', () => {
    it('should include all expected method names', () => {
      // This test verifies that the type is correctly inferred
      const methods: PlatformServicesMethod[] = [
        'launch',
        'terminate',
        'terminateAll',
        'sendRemoteMessage',
        'initializeRemoteComms',
        'stopRemoteComms',
        'closeConnection',
        'registerLocationHints',
        'reconnectPeer',
      ];

      for (const method of methods) {
        expect(typeof method).toBe('string');
      }
    });
  });

  describe('module consistency', () => {
    it('should have matching keys between handlers and specs', () => {
      const handlerKeys = Object.keys(platformServicesHandlers);
      const specKeys = Object.keys(platformServicesMethodSpecs);

      expect(handlerKeys.sort()).toStrictEqual(specKeys.sort());
    });

    it('should have handlers and specs with matching method names', () => {
      const handlerKeys = Object.keys(
        platformServicesHandlers,
      ) as (keyof typeof platformServicesHandlers)[];

      for (const key of handlerKeys) {
        const handler = platformServicesHandlers[key];
        const spec = platformServicesMethodSpecs[key];

        expect(handler.method).toBe(spec.method);
      }
    });

    it('should have exactly 11 platform services', () => {
      expect(Object.keys(platformServicesHandlers)).toHaveLength(11);
      expect(Object.keys(platformServicesMethodSpecs)).toHaveLength(11);
    });

    it('should maintain handler-spec consistency for all services', () => {
      const services = [
        'launch',
        'terminate',
        'terminateAll',
        'sendRemoteMessage',
        'initializeRemoteComms',
        'stopRemoteComms',
        'closeConnection',
        'registerLocationHints',
        'reconnectPeer',
        'handleAck',
        'updateReceivedSeq',
      ] as const;

      for (const service of services) {
        const handler = platformServicesHandlers[service];
        const spec = platformServicesMethodSpecs[service];

        // Method name consistency
        expect(handler.method).toBe(spec.method);
        expect(handler.method).toBe(service);

        // Result type consistency (both should have same result validator)
        expect(handler.result).toBe(spec.result);

        // Params consistency (both should have same params validator)
        expect(handler.params).toBe(spec.params);
      }
    });

    it('should have all handlers with proper hook configurations', () => {
      const handlerKeys = Object.keys(
        platformServicesHandlers,
      ) as (keyof typeof platformServicesHandlers)[];

      for (const key of handlerKeys) {
        const handler = platformServicesHandlers[key];

        // Each handler should have exactly one hook with the same name as the method
        expect(Object.keys(handler.hooks)).toHaveLength(1);
        expect(
          handler.hooks[handler.method as keyof typeof handler.hooks],
        ).toBe(true);
      }
    });

    it('should have all method names as valid identifiers', () => {
      const handlerKeys = Object.keys(platformServicesHandlers);

      for (const key of handlerKeys) {
        // Should be valid JavaScript identifier (no spaces, special chars, etc.)
        expect(key).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/u);

        // Should follow camelCase convention
        expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/u);
      }
    });
  });

  describe('type safety', () => {
    it('should maintain type safety for handlers', () => {
      // This test ensures TypeScript types are correctly maintained
      const handler = platformServicesHandlers.launch;

      // The handler should be typed correctly
      expect(handler.method).toBe('launch');
      expect(typeof handler.implementation).toBe('function');
    });

    it('should maintain type safety for method specs', () => {
      // This test ensures TypeScript types are correctly maintained
      const spec = platformServicesMethodSpecs.launch;

      // The spec should be typed correctly
      expect(spec.method).toBe('launch');
      expect(spec.params).toBeDefined();
      expect(spec.result).toBeDefined();
    });
  });
});
