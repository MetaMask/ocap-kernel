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

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    subLogger: vi.fn().mockReturnThis(),
  };

  const defaultState: TestState = {
    installed: [],
    manifests: {},
    count: 0,
  };

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
        defaultState,
        logger: mockLogger as never,
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
        defaultState: {
          installed: [] as string[],
          manifests: {},
          metadata: { version: 1 },
        },
        logger: mockLogger as never,
        debounceMs: 0,
      });

      expect(storage.state.installed).toStrictEqual(['existing']);
      expect(storage.state.manifests).toStrictEqual({});
      expect(storage.state.metadata).toStrictEqual({ version: 1 });
    });

    it('uses all defaults when storage is empty', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([]);

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
        logger: mockLogger as never,
        debounceMs: 0,
      });

      expect(storage.state.installed).toStrictEqual([]);
      expect(storage.state.manifests).toStrictEqual({});
      expect(storage.state.count).toBe(0);
    });

    it('returns hardened state copy', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: { items: ['original'] as string[] },
        logger: mockLogger as never,
        debounceMs: 0,
      });

      // Get a reference to the state
      const state1 = storage.state;

      // Modifications to the returned state should not affect the internal state
      // (In SES environment, this would throw; in tests, we verify isolation)
      try {
        (state1 as { items: string[] }).items.push('modified');
      } catch {
        // Expected in SES environment
      }

      // Get a fresh state - it should still have the original value
      const state2 = storage.state;
      expect(state2.items).toStrictEqual(['original']);
    });
  });

  describe('state access', () => {
    it('provides readonly access to current state', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['ns.count']);
      vi.mocked(mockAdapter.get).mockResolvedValue(42);

      const storage = await ControllerStorage.make({
        namespace: 'ns',
        adapter: mockAdapter,
        defaultState: { count: 0 },
        logger: mockLogger as never,
        debounceMs: 0,
      });

      expect(storage.state.count).toBe(42);
    });
  });

  describe('update', () => {
    it('persists only modified top-level keys', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
        logger: mockLogger as never,
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
        defaultState,
        logger: mockLogger as never,
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
        defaultState,
        logger: mockLogger as never,
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
        defaultState: { a: 1, b: 2, c: 3 },
        logger: mockLogger as never,
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

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
        logger: mockLogger as never,
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
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to persist state changes:',
        expect.any(Error),
      );
    });

    it('handles nested object modifications', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
        logger: mockLogger as never,
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

    it('handles array operations', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.installed']);
      vi.mocked(mockAdapter.get).mockResolvedValue(['app1', 'app2']);

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
        logger: mockLogger as never,
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.installed = draft.installed.filter((id) => id !== 'app1');
      });

      // Wait for persistence
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.installed', ['app2']);
    });

    it('handles delete operations on nested objects', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.manifests']);
      vi.mocked(mockAdapter.get).mockResolvedValue({
        app1: { name: 'App 1' },
        app2: { name: 'App 2' },
      });

      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
        logger: mockLogger as never,
        debounceMs: 0,
      });

      storage.update((draft) => {
        delete draft.manifests.app1;
      });

      // Wait for persistence
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.manifests', {
        app2: { name: 'App 2' },
      });
    });
  });

  describe('namespace isolation', () => {
    it('uses different prefixes for different namespaces', async () => {
      await ControllerStorage.make({
        namespace: 'caplet',
        adapter: mockAdapter,
        defaultState: { value: 1 },
        logger: mockLogger as never,
        debounceMs: 0,
      });

      await ControllerStorage.make({
        namespace: 'service',
        adapter: mockAdapter,
        defaultState: { value: 2 },
        logger: mockLogger as never,
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
        defaultState: { a: 0, b: 0, c: 0 },
        logger: mockLogger as never,
        debounceMs: 100,
      });

      // First update: modifies a and b
      storage.update((draft) => {
        draft.a = 1;
        draft.b = 1;
      });

      // Second update at t=50ms: modifies only a
      vi.advanceTimersByTime(50);
      storage.update((draft) => {
        draft.a = 2;
      });

      // Timer should fire at t=100ms (from first update)
      vi.advanceTimersByTime(50);
      await vi.runAllTimersAsync();

      // Both a and b should be persisted (accumulated keys)
      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 2);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.b', 1);
    });

    it('does not reset timer on subsequent writes', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: { a: 0 },
        logger: mockLogger as never,
        debounceMs: 100,
      });

      storage.update((draft) => {
        draft.a = 1;
      });

      // Second write at t=90ms (before first timer fires)
      vi.advanceTimersByTime(90);
      storage.update((draft) => {
        draft.a = 2;
      });

      // Timer fires at t=100ms (NOT reset to t=190ms)
      vi.advanceTimersByTime(10);
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 2);
    });

    it('writes immediately when idle > debounceMs', async () => {
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: { a: 0 },
        logger: mockLogger as never,
        debounceMs: 100,
      });

      storage.update((draft) => {
        draft.a = 1;
      });
      await vi.runAllTimersAsync();
      vi.clearAllMocks();

      // Wait 150ms (> debounceMs)
      vi.advanceTimersByTime(150);

      // Next write should be immediate (no debounce)
      storage.update((draft) => {
        draft.a = 2;
      });
      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 2);
    });
  });

  describe('clear', () => {
    it('resets state to default', async () => {
      const testDefaultState = { items: [] as string[], count: 0 };
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: testDefaultState,
        logger: mockLogger as never,
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
      const clearDefaultState = { a: 0, b: 0 };
      const storage = await ControllerStorage.make({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: clearDefaultState,
        logger: mockLogger as never,
        debounceMs: 0,
      });

      storage.update((draft) => {
        draft.a = 5;
        draft.b = 10;
      });

      await vi.runAllTimersAsync();
      vi.clearAllMocks();

      storage.clear();

      await vi.runAllTimersAsync();

      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 0);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.b', 0);
    });
  });
});
