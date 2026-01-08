import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeControllerStorage } from './controller-storage.ts';
import type { StorageAdapter } from './types.ts';

type TestState = {
  installed: string[];
  manifests: Record<string, { name: string }>;
  count: number;
};

describe('makeControllerStorage', () => {
  const mockAdapter: StorageAdapter = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
  };

  const defaultState: TestState = {
    installed: [],
    manifests: {},
    count: 0,
  };

  beforeEach(() => {
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

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
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

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: {
          installed: [] as string[],
          manifests: {},
          metadata: { version: 1 },
        },
      });

      expect(storage.state.installed).toStrictEqual(['existing']);
      expect(storage.state.manifests).toStrictEqual({});
      expect(storage.state.metadata).toStrictEqual({ version: 1 });
    });

    it('uses all defaults when storage is empty', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([]);

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      expect(storage.state.installed).toStrictEqual([]);
      expect(storage.state.manifests).toStrictEqual({});
      expect(storage.state.count).toBe(0);
    });

    it('returns hardened state copy', async () => {
      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: { items: ['original'] as string[] },
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

      const storage = await makeControllerStorage({
        namespace: 'ns',
        adapter: mockAdapter,
        defaultState: { count: 0 },
      });

      expect(storage.state.count).toBe(42);
    });
  });

  describe('update', () => {
    it('persists only modified top-level keys', async () => {
      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await storage.update((draft) => {
        draft.installed.push('new-app');
        // manifests and count not modified
      });

      expect(mockAdapter.set).toHaveBeenCalledTimes(1);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.installed', [
        'new-app',
      ]);
    });

    it('updates in-memory state after persistence', async () => {
      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await storage.update((draft) => {
        draft.installed.push('item1');
      });

      expect(storage.state.installed).toStrictEqual(['item1']);
    });

    it('does not persist when no changes made', async () => {
      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await storage.update((draft) => {
        // No actual changes
        draft.count = 0;
      });

      expect(mockAdapter.set).not.toHaveBeenCalled();
    });

    it('persists multiple modified keys', async () => {
      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState: { a: 1, b: 2, c: 3 },
      });

      await storage.update((draft) => {
        draft.a = 10;
        draft.c = 30;
      });

      expect(mockAdapter.set).toHaveBeenCalledTimes(2);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.a', 10);
      expect(mockAdapter.set).toHaveBeenCalledWith('test.c', 30);
    });

    it('does not update state if persistence fails', async () => {
      vi.mocked(mockAdapter.set).mockRejectedValue(new Error('Storage error'));

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await expect(
        storage.update((draft) => {
          draft.count = 100;
        }),
      ).rejects.toThrow('Storage error');

      // State should remain unchanged
      expect(storage.state.count).toBe(0);
    });

    it('handles nested object modifications', async () => {
      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await storage.update((draft) => {
        draft.manifests['new-app'] = { name: 'New App' };
      });

      expect(mockAdapter.set).toHaveBeenCalledWith('test.manifests', {
        'new-app': { name: 'New App' },
      });
    });

    it('handles array operations', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.installed']);
      vi.mocked(mockAdapter.get).mockResolvedValue(['app1', 'app2']);

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await storage.update((draft) => {
        draft.installed = draft.installed.filter((id) => id !== 'app1');
      });

      expect(mockAdapter.set).toHaveBeenCalledWith('test.installed', ['app2']);
    });

    it('handles delete operations on nested objects', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.manifests']);
      vi.mocked(mockAdapter.get).mockResolvedValue({
        app1: { name: 'App 1' },
        app2: { name: 'App 2' },
      });

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      await storage.update((draft) => {
        delete draft.manifests.app1;
      });

      expect(mockAdapter.set).toHaveBeenCalledWith('test.manifests', {
        app2: { name: 'App 2' },
      });
    });
  });

  describe('reload', () => {
    it('reloads state from storage', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue([]);

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      expect(storage.state.count).toBe(0);

      // Simulate external storage update
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.count']);
      vi.mocked(mockAdapter.get).mockResolvedValue(999);

      await storage.reload();

      expect(storage.state.count).toBe(999);
    });

    it('merges with defaults after reload', async () => {
      vi.mocked(mockAdapter.keys).mockResolvedValue(['test.count']);
      vi.mocked(mockAdapter.get).mockResolvedValue(42);

      const storage = await makeControllerStorage({
        namespace: 'test',
        adapter: mockAdapter,
        defaultState,
      });

      // Reload - count from storage, others from defaults
      await storage.reload();

      expect(storage.state.count).toBe(42);
      expect(storage.state.installed).toStrictEqual([]);
      expect(storage.state.manifests).toStrictEqual({});
    });
  });

  describe('namespace isolation', () => {
    it('uses different prefixes for different namespaces', async () => {
      await makeControllerStorage({
        namespace: 'caplet',
        adapter: mockAdapter,
        defaultState: { value: 1 },
      });

      await makeControllerStorage({
        namespace: 'service',
        adapter: mockAdapter,
        defaultState: { value: 2 },
      });

      expect(mockAdapter.keys).toHaveBeenCalledWith('caplet.');
      expect(mockAdapter.keys).toHaveBeenCalledWith('service.');
    });
  });
});
