import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PresenceManager, KernelLike } from './kref-presence.ts';
import { makePresenceManager } from './kref-presence.ts';
import { kslot } from './liveslots/kernel-marshal.ts';

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

describe('makePresenceManager', () => {
  let mockKernelLike: KernelLike;
  let presenceManager: PresenceManager;

  beforeEach(() => {
    mockKernelLike = {
      ping: vi.fn(),
      launchSubcluster: vi.fn(),
      terminateSubcluster: vi.fn(),
      queueMessage: vi.fn(),
      getStatus: vi.fn(),
      pingVat: vi.fn(),
      getVatRoot: vi.fn(),
    } as unknown as KernelLike;

    presenceManager = makePresenceManager({
      kernel: mockKernelLike,
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

  describe('presence-to-standin conversion in sendToKernel', () => {
    // These tests verify that presences are recursively converted to standin
    // objects (via kslot) when passed as arguments to E() calls on presences.
    // The kernel's queueMessage expects standin objects, not presences.

    beforeEach(() => {
      // Set up queueMessage to return a valid CapData response
      vi.mocked(mockKernelLike.queueMessage).mockResolvedValue({
        body: '#null',
        slots: [],
      });
    });

    it('converts top-level presence argument to standin', async () => {
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (arg: unknown) => unknown;
      };
      const argPresence = presenceManager.resolveKref('ko2');

      // Call method with presence as argument
      await targetPresence.someMethod(argPresence);

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [kslot('ko2')],
      );
    });

    it('converts nested presence in object argument to standin', async () => {
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (arg: { nested: unknown }) => unknown;
      };
      const nestedPresence = presenceManager.resolveKref('ko2');

      await targetPresence.someMethod({ nested: nestedPresence });

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [{ nested: kslot('ko2') }],
      );
    });

    it('converts presences in array argument to standins', async () => {
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (arg: unknown[]) => unknown;
      };
      const presence2 = presenceManager.resolveKref('ko2');
      const presence3 = presenceManager.resolveKref('ko3');

      await targetPresence.someMethod([presence2, presence3]);

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [[kslot('ko2'), kslot('ko3')]],
      );
    });

    it('converts deeply nested presences to standins', async () => {
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (arg: { a: { b: { c: unknown } } }) => unknown;
      };
      const deepPresence = presenceManager.resolveKref('ko99');

      await targetPresence.someMethod({ a: { b: { c: deepPresence } } });

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [{ a: { b: { c: kslot('ko99') } } }],
      );
    });

    it('handles mixed arguments with primitives and nested presences', async () => {
      type Args = [string, { nested: unknown }, unknown, number];
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (...args: Args) => unknown;
      };
      const presence2 = presenceManager.resolveKref('ko2');
      const presence3 = presenceManager.resolveKref('ko3');

      await targetPresence.someMethod(
        'primitive',
        { nested: presence2 },
        presence3,
        42,
      );

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        ['primitive', { nested: kslot('ko2') }, kslot('ko3'), 42],
      );
    });

    it('preserves non-presence objects unchanged', async () => {
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (arg: { data: string; count: number }) => unknown;
      };

      await targetPresence.someMethod({ data: 'value', count: 123 });

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
        'ko1',
        'someMethod',
        [{ data: 'value', count: 123 }],
      );
    });

    it('handles array with mixed presences and primitives', async () => {
      const targetPresence = presenceManager.resolveKref('ko1') as {
        someMethod: (
          arg: [unknown, string, number, { key: unknown }],
        ) => unknown;
      };
      const presence2 = presenceManager.resolveKref('ko2');

      await targetPresence.someMethod([
        presence2,
        'string',
        42,
        { key: presence2 },
      ]);

      expect(mockKernelLike.queueMessage).toHaveBeenCalledWith(
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
