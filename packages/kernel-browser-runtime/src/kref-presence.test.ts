import { passStyleOf } from '@endo/marshal';
import { krefOf as kernelKrefOf, kslot } from '@metamask/ocap-kernel';
import type { SlotValue } from '@metamask/ocap-kernel';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PresenceManager } from './kref-presence.ts';
import {
  convertKrefsToStandins,
  makePresenceManager,
} from './kref-presence.ts';
import type { KernelFacade } from './types.ts';

// EHandler type definition (copied to avoid import issues with mocking)
type EHandler = {
  get?: (target: object, prop: PropertyKey) => Promise<unknown>;
  applyMethod?: (
    target: object,
    prop: PropertyKey,
    args: unknown[],
  ) => Promise<unknown>;
  applyFunction?: (target: object, args: unknown[]) => Promise<unknown>;
};

// Hoisted mock setup - these must be defined before vi.mock() is hoisted
const { MockHandledPromise, mockE } = vi.hoisted(() => {
  /**
   * Mock HandledPromise that supports resolveWithPresence.
   */
  class MockHandledPromiseImpl<TResult> extends Promise<TResult> {
    constructor(
      executor: (
        resolve: (value: TResult | PromiseLike<TResult>) => void,
        reject: (reason?: unknown) => void,
        resolveWithPresence: (handler: EHandler) => object,
      ) => void,
      _handler?: EHandler,
    ) {
      let presence: object | undefined;

      const resolveWithPresence = (handler: EHandler): object => {
        // Create a simple presence object that can receive E() calls
        presence = new Proxy(
          {},
          {
            get(_target, prop) {
              if (prop === Symbol.toStringTag) {
                return 'Alleged: VatObject';
              }
              // Return a function that calls the handler
              return async (...args: unknown[]) => {
                if (typeof prop === 'string') {
                  return handler.applyMethod?.(presence!, prop, args);
                }
                return undefined;
              };
            },
          },
        );
        return presence;
      };

      super((resolve, reject) => {
        executor(resolve, reject, resolveWithPresence);
      });
    }
  }

  // Mock E() to intercept calls on presences
  const mockEImpl = (target: object) => {
    return new Proxy(
      {},
      {
        get(_proxyTarget, prop) {
          if (typeof prop === 'string') {
            // Return a function that, when called, invokes the presence's method
            return (...args: unknown[]) => {
              const method = (target as Record<string, unknown>)[prop];
              if (typeof method === 'function') {
                return (method as (...a: unknown[]) => unknown)(...args);
              }
              // Try to get it from the proxy
              return (target as Record<string, (...a: unknown[]) => unknown>)[
                prop
              ]?.(...args);
            };
          }
          return undefined;
        },
      },
    );
  };

  return {
    MockHandledPromise: MockHandledPromiseImpl,
    mockE: mockEImpl,
  };
});

// Apply mocks
vi.mock('@endo/eventual-send', () => ({
  E: mockE,
  HandledPromise: MockHandledPromise,
}));

describe('convertKrefsToStandins', () => {
  describe('kref string conversion', () => {
    it('converts ko kref string to standin', () => {
      const result = convertKrefsToStandins('ko123') as SlotValue;

      expect(passStyleOf(result)).toBe('remotable');
      expect(kernelKrefOf(result)).toBe('ko123');
    });

    it('converts kp kref string to standin promise', () => {
      const result = convertKrefsToStandins('kp456');

      expect(passStyleOf(result)).toBe('promise');
      expect(kernelKrefOf(result as Promise<unknown>)).toBe('kp456');
    });

    it('does not convert non-kref strings', () => {
      expect(convertKrefsToStandins('hello')).toBe('hello');
      expect(convertKrefsToStandins('k123')).toBe('k123');
      expect(convertKrefsToStandins('kox')).toBe('kox');
      expect(convertKrefsToStandins('ko')).toBe('ko');
      expect(convertKrefsToStandins('kp')).toBe('kp');
      expect(convertKrefsToStandins('ko123x')).toBe('ko123x');
    });
  });

  describe('array processing', () => {
    it('recursively converts krefs in arrays', () => {
      const result = convertKrefsToStandins(['ko1', 'ko2']) as unknown[];

      expect(result).toHaveLength(2);
      expect(kernelKrefOf(result[0] as SlotValue)).toBe('ko1');
      expect(kernelKrefOf(result[1] as SlotValue)).toBe('ko2');
    });

    it('handles mixed arrays with krefs and primitives', () => {
      const result = convertKrefsToStandins([
        'ko1',
        42,
        'hello',
        true,
      ]) as unknown[];

      expect(result).toHaveLength(4);
      expect(kernelKrefOf(result[0] as SlotValue)).toBe('ko1');
      expect(result[1]).toBe(42);
      expect(result[2]).toBe('hello');
      expect(result[3]).toBe(true);
    });

    it('handles empty arrays', () => {
      const result = convertKrefsToStandins([]);
      expect(result).toStrictEqual([]);
    });

    it('handles nested arrays', () => {
      const result = convertKrefsToStandins([['ko1'], ['ko2']]) as unknown[][];

      expect(kernelKrefOf(result[0]![0] as SlotValue)).toBe('ko1');
      expect(kernelKrefOf(result[1]![0] as SlotValue)).toBe('ko2');
    });
  });

  describe('object processing', () => {
    it('recursively converts krefs in objects', () => {
      const result = convertKrefsToStandins({
        target: 'ko1',
        promise: 'kp2',
      }) as Record<string, unknown>;

      expect(kernelKrefOf(result.target as SlotValue)).toBe('ko1');
      expect(kernelKrefOf(result.promise as Promise<unknown>)).toBe('kp2');
    });

    it('handles nested objects', () => {
      const result = convertKrefsToStandins({
        outer: {
          inner: 'ko42',
        },
      }) as Record<string, Record<string, unknown>>;

      expect(kernelKrefOf(result.outer!.inner as SlotValue)).toBe('ko42');
    });

    it('handles empty objects', () => {
      const result = convertKrefsToStandins({});
      expect(result).toStrictEqual({});
    });

    it('handles objects with mixed values', () => {
      const result = convertKrefsToStandins({
        kref: 'ko1',
        number: 123,
        string: 'text',
        boolean: false,
        nullValue: null,
      }) as Record<string, unknown>;

      expect(kernelKrefOf(result.kref as SlotValue)).toBe('ko1');
      expect(result.number).toBe(123);
      expect(result.string).toBe('text');
      expect(result.boolean).toBe(false);
      expect(result.nullValue).toBeNull();
    });
  });

  describe('primitive handling', () => {
    it('passes through numbers unchanged', () => {
      expect(convertKrefsToStandins(42)).toBe(42);
      expect(convertKrefsToStandins(0)).toBe(0);
      expect(convertKrefsToStandins(-1)).toBe(-1);
    });

    it('passes through booleans unchanged', () => {
      expect(convertKrefsToStandins(true)).toBe(true);
      expect(convertKrefsToStandins(false)).toBe(false);
    });

    it('passes through null unchanged', () => {
      expect(convertKrefsToStandins(null)).toBeNull();
    });

    it('passes through undefined unchanged', () => {
      expect(convertKrefsToStandins(undefined)).toBeUndefined();
    });
  });
});

describe('makePresenceManager', () => {
  let mockKernelFacade: KernelFacade;
  let presenceManager: PresenceManager;

  beforeEach(() => {
    mockKernelFacade = {
      ping: vi.fn(),
      launchSubcluster: vi.fn(),
      terminateSubcluster: vi.fn(),
      queueMessage: vi.fn(),
      getStatus: vi.fn(),
      pingVat: vi.fn(),
      getVatRoot: vi.fn(),
    } as unknown as KernelFacade;

    presenceManager = makePresenceManager({
      kernelFacade: mockKernelFacade,
    });
  });

  describe('resolveKref', () => {
    it('returns a presence object for a kref', () => {
      const presence = presenceManager.resolveKref('ko42');

      expect(presence).toBeDefined();
      expect(typeof presence).toBe('object');
    });

    it('returns the same presence for the same kref (memoization)', () => {
      const presence1 = presenceManager.resolveKref('ko42');
      const presence2 = presenceManager.resolveKref('ko42');

      expect(presence1).toBe(presence2);
    });

    it('returns different presences for different krefs', () => {
      const presence1 = presenceManager.resolveKref('ko1');
      const presence2 = presenceManager.resolveKref('ko2');

      expect(presence1).not.toBe(presence2);
    });
  });

  describe('krefOf', () => {
    it('returns the kref for a known presence', () => {
      const presence = presenceManager.resolveKref('ko42');
      const kref = presenceManager.krefOf(presence);

      expect(kref).toBe('ko42');
    });

    it('returns undefined for an unknown object', () => {
      const unknownObject = { foo: 'bar' };
      const kref = presenceManager.krefOf(unknownObject);

      expect(kref).toBeUndefined();
    });
  });

  describe('presence-to-kref conversion in sendToKernel', () => {
    // These tests verify that presences are recursively converted to standin
    // objects (via kslot) when passed as arguments to E() calls on presences.
    // The kernel's queueMessage expects standin objects, not raw kref strings.

    beforeEach(() => {
      // Set up queueMessage to return a valid CapData response
      vi.mocked(mockKernelFacade.queueMessage).mockResolvedValue({
        body: '#null',
        slots: [],
      });
    });

    it('converts top-level presence argument to standin', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');
      const argPresence = presenceManager.resolveKref('ko2');

      // Call method with presence as argument
      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod(argPresence);

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [kslot('ko2')],
      );
    });

    it('converts nested presence in object argument to standin', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');
      const nestedPresence = presenceManager.resolveKref('ko2');

      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod({ nested: nestedPresence });

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [{ nested: kslot('ko2') }],
      );
    });

    it('converts presences in array argument to standins', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');
      const presence2 = presenceManager.resolveKref('ko2');
      const presence3 = presenceManager.resolveKref('ko3');

      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod([presence2, presence3]);

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [[kslot('ko2'), kslot('ko3')]],
      );
    });

    it('converts deeply nested presences to standins', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');
      const deepPresence = presenceManager.resolveKref('ko99');

      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod({ a: { b: { c: deepPresence } } });

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [{ a: { b: { c: kslot('ko99') } } }],
      );
    });

    it('handles mixed arguments with primitives and nested presences', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');
      const presence2 = presenceManager.resolveKref('ko2');
      const presence3 = presenceManager.resolveKref('ko3');

      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod('primitive', { nested: presence2 }, presence3, 42);

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        ['primitive', { nested: kslot('ko2') }, kslot('ko3'), 42],
      );
    });

    it('preserves non-presence objects unchanged', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');

      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod({ data: 'value', count: 123 });

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [{ data: 'value', count: 123 }],
      );
    });

    it('handles array with mixed presences and primitives', async () => {
      const targetPresence = presenceManager.resolveKref('ko1');
      const presence2 = presenceManager.resolveKref('ko2');

      await (
        targetPresence as Record<string, (...args: unknown[]) => unknown>
      ).someMethod([presence2, 'string', 42, { key: presence2 }]);

      expect(mockKernelFacade.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [[kslot('ko2'), 'string', 42, { key: kslot('ko2') }]],
      );
    });
  });

  // Note: fromCapData and full E() handler integration tests require the real
  // Endo runtime environment with proper SES lockdown. These behaviors are
  // tested in captp.integration.test.ts which runs with the real Endo setup.
});
