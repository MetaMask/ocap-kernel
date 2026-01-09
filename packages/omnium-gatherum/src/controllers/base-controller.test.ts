import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Controller } from './base-controller.ts';
import type { ControllerConfig } from './base-controller.ts';
import { ControllerStorage } from './storage/controller-storage.ts';
import type { StorageAdapter } from './storage/types.ts';
import { makeMockStorageAdapter } from '../../test/utils.ts';

/**
 * Test state for the concrete test controller.
 */
type TestState = {
  items: Record<string, { name: string; value: number }>;
  count: number;
};

/**
 * Test methods for the concrete test controller.
 */
type TestMethods = {
  addItem: (id: string, name: string, value: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  getItem: (id: string) => Promise<{ name: string; value: number } | undefined>;
  getCount: () => Promise<number>;
  clearState: () => void;
  getState: () => Readonly<TestState>;
};

/**
 * Concrete controller for testing the abstract Controller base class.
 */
class TestController extends Controller<
  'TestController',
  TestState,
  TestMethods
> {
  // eslint-disable-next-line no-restricted-syntax -- TypeScript doesn't support # for constructors
  private constructor(storage: ControllerStorage<TestState>, logger: Logger) {
    super('TestController', storage, logger);
    harden(this);
  }

  static async make(
    config: ControllerConfig,
    adapter: StorageAdapter,
  ): Promise<TestMethods> {
    const storage = await ControllerStorage.make({
      namespace: 'test',
      adapter,
      defaultState: {
        items: {},
        count: 0,
      },
      logger: config.logger,
      debounceMs: 0,
    });

    const controller = new TestController(storage, config.logger);
    return controller.makeFacet();
  }

  makeFacet(): TestMethods {
    return makeDefaultExo('TestController', {
      addItem: async (
        id: string,
        name: string,
        value: number,
      ): Promise<void> => {
        this.logger.info(`Adding item: ${id}`);
        this.update((draft) => {
          draft.items[id] = { name, value };
          draft.count += 1;
        });
      },
      removeItem: async (id: string): Promise<void> => {
        this.logger.info(`Removing item: ${id}`);
        this.update((draft) => {
          delete draft.items[id];
          draft.count -= 1;
        });
      },
      getItem: async (
        id: string,
      ): Promise<{ name: string; value: number } | undefined> => {
        return this.state.items[id];
      },
      getCount: async (): Promise<number> => {
        return this.state.count;
      },
      clearState: (): void => {
        this.clearState();
      },
      getState: (): Readonly<TestState> => {
        return this.state;
      },
    });
  }
}
harden(TestController);

describe('Controller', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    subLogger: vi.fn().mockReturnThis(),
  };

  const config: ControllerConfig = {
    logger: mockLogger as unknown as ControllerConfig['logger'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('state access', () => {
    it('provides read-only access to state', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await mockAdapter.set('test.items', { foo: { name: 'Foo', value: 42 } });
      await mockAdapter.set('test.count', 1);

      const controller = await TestController.make(config, mockAdapter);

      const item = await controller.getItem('foo');

      expect(item).toStrictEqual({ name: 'Foo', value: 42 });
    });

    it('returns undefined for non-existent items', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);

      const item = await controller.getItem('nonexistent');

      expect(item).toBeUndefined();
    });

    it('reflects initial state count', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await mockAdapter.set('test.items', {
        a: { name: 'A', value: 1 },
        b: { name: 'B', value: 2 },
      });
      await mockAdapter.set('test.count', 2);

      const controller = await TestController.make(config, mockAdapter);

      const count = await controller.getCount();

      expect(count).toBe(2);
    });
  });

  describe('state updates', () => {
    it('updates state through update method', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);

      await controller.addItem('test', 'Test Item', 100);

      const item = await controller.getItem('test');
      expect(item).toStrictEqual({ name: 'Test Item', value: 100 });
    });

    it('increments count when adding items', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);

      await controller.addItem('a', 'Item A', 1);
      await controller.addItem('b', 'Item B', 2);

      const count = await controller.getCount();
      expect(count).toBe(2);
    });

    it('decrements count when removing items', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await mockAdapter.set('test.items', {
        a: { name: 'A', value: 1 },
        b: { name: 'B', value: 2 },
      });
      await mockAdapter.set('test.count', 2);

      const controller = await TestController.make(config, mockAdapter);

      await controller.removeItem('a');

      const count = await controller.getCount();
      expect(count).toBe(1);
    });

    it('removes item from state', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await mockAdapter.set('test.items', { foo: { name: 'Foo', value: 42 } });
      await mockAdapter.set('test.count', 1);

      const controller = await TestController.make(config, mockAdapter);

      await controller.removeItem('foo');

      const item = await controller.getItem('foo');
      expect(item).toBeUndefined();
    });

    it('persists state modifications to storage', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);

      await controller.addItem('a', 'A', 1);
      await controller.addItem('b', 'B', 2);
      await controller.removeItem('a');

      // Wait for debounced persistence
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check that state was persisted
      const items = await mockAdapter.get('test.items');
      const count = await mockAdapter.get('test.count');
      expect(items).toStrictEqual({ b: { name: 'B', value: 2 } });
      expect(count).toBe(1);
    });
  });

  describe('logging', () => {
    it('logs through provided logger', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);

      await controller.addItem('test', 'Test', 1);

      expect(mockLogger.info).toHaveBeenCalledWith('Adding item: test');
    });

    it('logs remove operations', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await mockAdapter.set('test.items', { foo: { name: 'Foo', value: 42 } });
      await mockAdapter.set('test.count', 1);

      const controller = await TestController.make(config, mockAdapter);

      await controller.removeItem('foo');

      expect(mockLogger.info).toHaveBeenCalledWith('Removing item: foo');
    });
  });

  describe('clearState', () => {
    it('clears state through clearState method', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);
      await controller.addItem('a', 'A', 1);

      const stateBefore = controller.getState();
      expect(stateBefore.items).toStrictEqual({ a: { name: 'A', value: 1 } });
      expect(stateBefore.count).toBe(1);

      controller.clearState();

      const stateAfter = controller.getState();
      expect(stateAfter.items).toStrictEqual({});
      expect(stateAfter.count).toBe(0);
    });

    it('persists cleared state', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await TestController.make(config, mockAdapter);
      await controller.addItem('a', 'A', 1);

      // Wait for persistence
      await new Promise((resolve) => setTimeout(resolve, 10));

      controller.clearState();

      // Wait for persistence
      await new Promise((resolve) => setTimeout(resolve, 10));

      const items = await mockAdapter.get('test.items');
      const count = await mockAdapter.get('test.count');
      expect(items).toStrictEqual({});
      expect(count).toBe(0);
    });
  });

  describe('makeFacet', () => {
    it('returns hardened exo with all methods', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const facet = await TestController.make(config, mockAdapter);

      expect(typeof facet.addItem).toBe('function');
      expect(typeof facet.removeItem).toBe('function');
      expect(typeof facet.getItem).toBe('function');
      expect(typeof facet.getCount).toBe('function');
      expect(typeof facet.clearState).toBe('function');
      expect(typeof facet.getState).toBe('function');
    });

    it('methods work correctly through exo', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const facet = await TestController.make(config, mockAdapter);

      await facet.addItem('x', 'X', 10);
      const item = await facet.getItem('x');
      const count = await facet.getCount();

      expect(item).toStrictEqual({ name: 'X', value: 10 });
      expect(count).toBe(1);
    });
  });
});
