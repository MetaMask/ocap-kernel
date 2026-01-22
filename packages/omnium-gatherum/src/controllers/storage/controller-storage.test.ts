import type { Logger } from '@metamask/logger';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ControllerStorage } from './controller-storage.ts';
import type { StorageAdapter } from './types.ts';

type TestState = {
  installed: string[];
  manifests: Record<string, { name: string }>;
  count: number;
};

vi.useFakeTimers();

describe('ControllerStorage', () => {
  const mockAdapter: StorageAdapter = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
  };

  const makeMockLogger = () =>
    ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      subLogger: vi.fn().mockReturnThis(),
    }) as unknown as Logger;

  const makeDefaultState: () => TestState = () => ({
    installed: [],
    manifests: {},
    count: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockAdapter.get).mockResolvedValue(undefined);
    vi.mocked(mockAdapter.set).mockResolvedValue(undefined);
    vi.mocked(mockAdapter.delete).mockResolvedValue(undefined);
    vi.mocked(mockAdapter.keys).mockResolvedValue([]);
  });

  describe('initialization', () => {
    it('loads existing state from storage on creation', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([
        'test.installed',
        'test.manifests',
      ]);
      vi.mocked(mockAdapter.get).mockImplementation(async (key: string) => {
        if (key === 'test.installed') {
          return ['app1'];
        }
        if (key === 'test.manifests') {
          return { app1: { name: 'App 1' } };
        }
        return undefined;
      });

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      expect(storage.state.installed).toStrictEqual(['app1']);
      expect(storage.state.manifests).toStrictEqual({
        app1: { name: 'App 1' },
      });
    });

    it('uses defaults for missing keys', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.installed']);
      vi.mocked(mockAdapter.get).mockImplementation(async (key: string) => {
        if (key === 'test.installed') {
          return ['existing'];
        }
        return undefined;
      });

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => ({
          installed: [] as string[],
          manifests: {},
          metadata: { version: 1 },
        }),
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      expect(storage.state).toStrictEqual({
        installed: ['existing'],
        manifests: {},
        metadata: { version: 1 },
      });
    });

    it('uses all defaults when storage is empty', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([]);

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      expect(storage.state).toStrictEqual({
        installed: [],
        manifests: {},
        count: 0,
      });
    });

    it('returns hardened state copy', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => ({ items: ['original'] as string[] }),
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      let error: unknown;

      // Modifications to the returned state should not affect the internal state
      try {
        storage.state.items.push('modified');
      } catch (thrown) {
        error = thrown;
      }

      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toContain(
        'Cannot add property 1, object is not extensible',
      );
      expect(storage.state).toStrictEqual({
        items: ['original'],
      });
    });
  });

  describe('update', () => {
    it('persists only modified top-level keys', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.installed.push('new-app');
        // manifests and count not modified
      });

      // Wait for persistence
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledTimes(1);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.installed', [
        'new-app',
      ]);
    });

    it('updates in-memory state immediately', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.installed.push('item1');
      });

      // State updated synchronously
      expect(storage.state.installed).toStrictEqual(['item1']);
    });

    it('does not persist when no changes made', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      storage.update((draft) => {
        // No actual changes
        draft.count = 0;
      });

      // Wait for potential persistence
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).not.toHaveBeenCalled();
    });

    it('persists multiple modified keys', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => ({ a: 1, b: 2, c: 3 }),
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.a = 10;
        draft.c = 30;
      });

      // Wait for persistence
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledTimes(2);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 10);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.c', 30);
    });

    it('updates state even if persistence fails (fire-and-forget)', async () => {
      vi.mocked(mockAdapter.set).mockRejectedValue(new Error('Storage error'));

      const logger = makeMockLogger();
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger,
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.count = 100;
      });

      // State updated immediately despite persistence failure
      expect(storage.state.count).toBe(100);

      // Wait for persistence attempt
      await vi.runAllTimersAsync();

      // Error should be logged
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to persist state changes:',
        expect.any(Error),
      );
    });

    it('persists top-level key when nested structure is modified', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.manifests['new-app'] = { name: 'New App' };
      });

      // Wait for persistence
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.manifests', {
        'new-app': { name: 'New App' },
      });
    });

    it('throws if producer returns a value', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => ({ a: 1 }),
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      expect(() => {
        storage.update(() => {
          return { a: 2 };
        });
      }).toThrow('Controller producers must return undefined');
    });
  });

  describe('namespace isolation', () => {
    it('uses different prefixes for different namespaces', async () => {
      await ControllerStorage.make({
        namespace: 'caplet',
        adapter: mockAdapter,
        makeDefaultState: () => ({ value: 1 }),
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      await ControllerStorage.make({
        namespace: 'service',
        adapter: mockAdapter,
        makeDefaultState: () => ({ value: 2 }),
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      expect(mockAdapter.keys).toHaveBeenCalledWith('caplet.');
      expect(mockAdapter.keys).toHaveBeenCalledWith('service.');
    });
  });

  describe('debouncing with key accumulation', () => {
    it('accumulates modified keys across multiple updates', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => ({ a: 0, b: 0, c: 0 }),
        logger: makeMockLogger(),
        debounceMs: 100,
      });

      // First update: modifies a and b
      // Persists immediately because the time since last write is 0
      storage.update((draft) => {
        draft.a = 1;
        draft.b = 1;
      });

      // Second update: modifies only a
      // Enqueues a timer to persist at t=100ms
      storage.update((draft) => {
        draft.a = 2;
      });

      // Second update at t=50ms: modifies only c
      vi.advanceTimersByTime(50);
      storage.update((draft) => {
        draft.c = 2;
      });

      // First persist is immediate
      expect(mockAdapter.set).toHaveBeenCalledTimes(2);
      expect(mockAdapter.set).toHaveBeenNthCalledWith(1, 'test.a', 1);
      expect(mockAdapter.set).toHaveBeenNthCalledWith(2, 'test.b', 1);

      // Second persist fires at t=100ms with accumulated keys (a and c)
      vi.advanceTimersByTime(50);
      expect(mockAdapter.set).toHaveBeenCalledTimes(4);
      expect(mockAdapter.set).toHaveBeenNthCalledWith(3, 'test.a', 2);
      expect(mockAdapter.set).toHaveBeenNthCalledWith(4, 'test.c', 2);
    });

    it('writes immediately when idle > debounceMs', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => ({ a: 0 }),
        logger: makeMockLogger(),
        debounceMs: 100,
      });

      // First write: persists immediately
      storage.update((draft) => {
        draft.a = 1;
      });

      // Second write: starts a timer to persist at t=100ms
      storage.update((draft) => {
        draft.a = 2;
      });

      // Wait 150ms (> debounceMs)
      vi.advanceTimersByTime(150);

      // Next write should be immediate (no debounce)
      storage.update((draft) => {
        draft.a = 3;
      });

      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 2);
      expect(mockAdapter.set).toHaveBeenLastCalledWith('test.a', 3);
      expect(storage.state.a).toBe(3);
    });
  });

  describe('clear', () => {
    it('resets state to default', async () => {
      const testDefaultState = { items: [] as string[], count: 0 };
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => testDefaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      // Modify state
      storage.update((draft) => {
        draft.items.push('item1');
        draft.count = 1;
      });

      expect(storage.state.items).toStrictEqual(['item1']);
      expect(storage.state.count).toBe(1);

      // Clear
      storage.clear();

      expect(storage.state.items).toStrictEqual([]);
      expect(storage.state.count).toBe(0);
    });

    it('persists cleared state', async () => {
      const defaultState = { a: 0, b: 0 };
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        makeDefaultState: () => defaultState,
        logger: makeMockLogger(),
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.a = 5;
        draft.b = 10;
      });

      storage.clear();

      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 0);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.b', 0);
    });
  });
});
