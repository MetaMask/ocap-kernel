import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Controller } from './base-controller.ts';
import type { ControllerConfig } from './base-controller.ts';
import type { ControllerStorage } from './storage/controller-storage.ts';

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

  static create(
    config: ControllerConfig,
    storage: ControllerStorage<TestState>,
  ): TestMethods {
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
        await this.update((draft) => {
          draft.items[id] = { name, value };
          draft.count += 1;
        });
      },
      removeItem: async (id: string): Promise<void> => {
        this.logger.info(`Removing item: ${id}`);
        await this.update((draft) => {
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
    });
  }
}
harden(TestController);

/**
 * Create a mock ControllerStorage for testing.
 *
 * @param initialState - The initial state for the mock storage.
 * @returns A mock ControllerStorage instance with update tracking.
 */
function createMockStorage(
  initialState: TestState,
): ControllerStorage<TestState> & { updateCalls: (() => void)[] } {
  let currentState = { ...initialState };
  const updateCalls: (() => void)[] = [];

  return {
    get state(): Readonly<TestState> {
      return harden({ ...currentState });
    },

    async update(producer: (draft: TestState) => void): Promise<void> {
      // Create a mutable draft
      const draft = JSON.parse(JSON.stringify(currentState)) as TestState;
      producer(draft);
      currentState = draft;
      updateCalls.push(() => producer(draft));
    },

    async reload(): Promise<void> {
      // No-op for tests
    },

    updateCalls,
  };
}

const emptyState: TestState = {
  items: {},
  count: 0,
};

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
      const initialState: TestState = {
        items: { foo: { name: 'Foo', value: 42 } },
        count: 1,
      };
      const mockStorage = createMockStorage(initialState);
      const controller = TestController.create(config, mockStorage);

      const item = await controller.getItem('foo');

      expect(item).toStrictEqual({ name: 'Foo', value: 42 });
    });

    it('returns undefined for non-existent items', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = TestController.create(config, mockStorage);

      const item = await controller.getItem('nonexistent');

      expect(item).toBeUndefined();
    });

    it('reflects initial state count', async () => {
      const initialState: TestState = {
        items: {
          a: { name: 'A', value: 1 },
          b: { name: 'B', value: 2 },
        },
        count: 2,
      };
      const mockStorage = createMockStorage(initialState);
      const controller = TestController.create(config, mockStorage);

      const count = await controller.getCount();

      expect(count).toBe(2);
    });
  });

  describe('state updates', () => {
    it('updates state through update method', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = TestController.create(config, mockStorage);

      await controller.addItem('test', 'Test Item', 100);

      const item = await controller.getItem('test');
      expect(item).toStrictEqual({ name: 'Test Item', value: 100 });
    });

    it('increments count when adding items', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = TestController.create(config, mockStorage);

      await controller.addItem('a', 'Item A', 1);
      await controller.addItem('b', 'Item B', 2);

      const count = await controller.getCount();
      expect(count).toBe(2);
    });

    it('decrements count when removing items', async () => {
      const initialState: TestState = {
        items: {
          a: { name: 'A', value: 1 },
          b: { name: 'B', value: 2 },
        },
        count: 2,
      };
      const mockStorage = createMockStorage(initialState);
      const controller = TestController.create(config, mockStorage);

      await controller.removeItem('a');

      const count = await controller.getCount();
      expect(count).toBe(1);
    });

    it('removes item from state', async () => {
      const initialState: TestState = {
        items: { foo: { name: 'Foo', value: 42 } },
        count: 1,
      };
      const mockStorage = createMockStorage(initialState);
      const controller = TestController.create(config, mockStorage);

      await controller.removeItem('foo');

      const item = await controller.getItem('foo');
      expect(item).toBeUndefined();
    });

    it('calls storage.update for each state modification', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = TestController.create(config, mockStorage);

      await controller.addItem('a', 'A', 1);
      await controller.addItem('b', 'B', 2);
      await controller.removeItem('a');

      expect(mockStorage.updateCalls).toHaveLength(3);
    });
  });

  describe('logging', () => {
    it('logs through provided logger', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = TestController.create(config, mockStorage);

      await controller.addItem('test', 'Test', 1);

      expect(mockLogger.info).toHaveBeenCalledWith('Adding item: test');
    });

    it('logs remove operations', async () => {
      const initialState: TestState = {
        items: { foo: { name: 'Foo', value: 42 } },
        count: 1,
      };
      const mockStorage = createMockStorage(initialState);
      const controller = TestController.create(config, mockStorage);

      await controller.removeItem('foo');

      expect(mockLogger.info).toHaveBeenCalledWith('Removing item: foo');
    });
  });

  describe('getMethods', () => {
    it('returns hardened exo with all methods', async () => {
      const mockStorage = createMockStorage(emptyState);
      const methods = TestController.create(config, mockStorage);

      expect(typeof methods.addItem).toBe('function');
      expect(typeof methods.removeItem).toBe('function');
      expect(typeof methods.getItem).toBe('function');
      expect(typeof methods.getCount).toBe('function');
    });

    it('methods work correctly through exo', async () => {
      const mockStorage = createMockStorage(emptyState);
      const methods = TestController.create(config, mockStorage);

      await methods.addItem('x', 'X', 10);
      const item = await methods.getItem('x');
      const count = await methods.getCount();

      expect(item).toStrictEqual({ name: 'X', value: 10 });
      expect(count).toBe(1);
    });
  });
});
