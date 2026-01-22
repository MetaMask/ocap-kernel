import type { Json } from '@metamask/utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CapletController } from './caplet-controller.ts';
import type { CapletManifest } from './types.ts';
import { makeMockStorageAdapter } from '../../../test/utils.ts';
import type { StorageAdapter } from '../storage/types.ts';
import type { ControllerConfig } from '../types.ts';

/**
 * Seed a mock adapter with caplet controller state.
 *
 * @param adapter - The adapter to seed.
 * @param caplets - The caplets to pre-populate.
 * @returns A promise that resolves when seeding is complete.
 */
async function seedAdapter(
  adapter: StorageAdapter,
  caplets: Record<string, unknown>,
): Promise<void> {
  await adapter.set('caplet.caplets', caplets as Json);
}

vi.useFakeTimers();

describe('CapletController.make', () => {
  const mockLaunchSubcluster = vi.fn();
  const mockTerminateSubcluster = vi.fn();
  const mockGetVatRoot = vi.fn();

  const makeMockLogger = () =>
    ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      subLogger: vi.fn().mockReturnThis(),
    }) as unknown as ControllerConfig['logger'];

  const makeConfig = (): ControllerConfig => ({
    logger: makeMockLogger(),
  });

  const makeManifest = (): CapletManifest => ({
    id: 'com.example.test',
    name: 'Test Caplet',
    version: '1.0.0',
    bundleSpec: 'https://example.com/bundle.json',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockLaunchSubcluster).mockResolvedValue({
      subclusterId: 'subcluster-123',
      rootKref: 'ko1',
    });
    vi.mocked(mockGetVatRoot).mockResolvedValue({});
  });

  describe('install', () => {
    it('installs a caplet successfully', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const result = await controller.install(makeManifest());

      expect(result).toStrictEqual({
        capletId: 'com.example.test',
        subclusterId: 'subcluster-123',
      });
    });

    it('validates the manifest', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const invalidManifest = { id: 'someCaplet' } as CapletManifest;

      await expect(controller.install(invalidManifest)).rejects.toThrow(
        'Invalid caplet manifest for someCaplet',
      );
    });

    it('throws if caplet already installed', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await seedAdapter(mockAdapter, {
        'com.example.test': {
          manifest: makeManifest(),
          subclusterId: 'subcluster-123',
          rootKref: 'ko1',
          installedAt: 1000,
        },
      });
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await expect(controller.install(makeManifest())).rejects.toThrow(
        'Caplet com.example.test is already installed',
      );
    });

    it('launches subcluster with correct config', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await controller.install(makeManifest());

      expect(mockLaunchSubcluster).toHaveBeenCalledWith({
        bootstrap: 'com.example.test',
        vats: {
          'com.example.test': {
            bundleSpec: 'https://example.com/bundle.json',
          },
        },
      });
    });

    it('stores caplet with manifest, subclusterId, and installedAt', async () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await controller.install(makeManifest());

      const caplet = controller.get('com.example.test');
      expect(caplet).toBeDefined();
      expect(caplet?.manifest).toStrictEqual(makeManifest());
      expect(caplet?.subclusterId).toBe('subcluster-123');
      expect(caplet?.installedAt).toBe(Date.now());
    });

    it('prevents concurrent installations of the same caplet', async () => {
      let resolveFirst: (value: {
        subclusterId: string;
        rootKref: string;
      }) => void;
      const firstInstallPromise = new Promise<{
        subclusterId: string;
        rootKref: string;
      }>((resolve) => {
        resolveFirst = resolve;
      });

      const mockAdapter = makeMockStorageAdapter();
      const slowLaunchSubcluster = vi.fn().mockReturnValue(firstInstallPromise);
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: slowLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const firstInstall = controller.install(makeManifest());

      await expect(controller.install(makeManifest())).rejects.toThrow(
        'Caplet com.example.test is already being installed',
      );

      resolveFirst!({ subclusterId: 'subcluster-123', rootKref: 'ko1' });
      expect(await firstInstall).toStrictEqual({
        capletId: 'com.example.test',
        subclusterId: 'subcluster-123',
      });
    });

    it('allows installation after a failed attempt', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const failingLaunchSubcluster = vi
        .fn()
        .mockRejectedValueOnce(new Error('Subcluster launch failed'))
        .mockResolvedValueOnce({
          subclusterId: 'subcluster-123',
          rootKref: 'ko1',
        });
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: failingLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await expect(controller.install(makeManifest())).rejects.toThrow(
        'Subcluster launch failed',
      );

      const capletAfterFailure = controller.get('com.example.test');
      expect(capletAfterFailure).toBeUndefined();

      const result = await controller.install(makeManifest());
      expect(result).toStrictEqual({
        capletId: 'com.example.test',
        subclusterId: 'subcluster-123',
      });

      const capletAfterSuccess = controller.get('com.example.test');
      expect(capletAfterSuccess).toBeDefined();
      expect(capletAfterSuccess?.subclusterId).toBe('subcluster-123');
    });
  });

  describe('uninstall', () => {
    it('uninstalls a caplet successfully', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await seedAdapter(mockAdapter, {
        'com.example.test': {
          manifest: makeManifest(),
          subclusterId: 'subcluster-123',
          rootKref: 'ko1',
          installedAt: 1000,
        },
      });
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await controller.uninstall('com.example.test');

      expect(mockTerminateSubcluster).toHaveBeenCalledWith('subcluster-123');
    });

    it('throws if caplet not found', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await expect(
        controller.uninstall('com.example.notfound'),
      ).rejects.toThrow('Caplet com.example.notfound not found');
    });

    it('removes caplet from state', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await seedAdapter(mockAdapter, {
        'com.example.test': {
          manifest: makeManifest(),
          subclusterId: 'subcluster-123',
          rootKref: 'ko1',
          installedAt: 1000,
        },
      });
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      await controller.uninstall('com.example.test');

      const caplet = controller.get('com.example.test');
      expect(caplet).toBeUndefined();
    });

    it('handles concurrent uninstall attempts', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await seedAdapter(mockAdapter, {
        'com.example.test': {
          manifest: makeManifest(),
          subclusterId: 'subcluster-123',
          rootKref: 'ko1',
          installedAt: 1000,
        },
      });
      const slowTerminateSubcluster = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Subcluster not found'));
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: slowTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const firstUninstall = controller.uninstall('com.example.test');
      const secondUninstall = controller.uninstall('com.example.test');

      expect(await firstUninstall).toBeUndefined();
      await expect(secondUninstall).rejects.toThrow('Subcluster not found');
      expect(slowTerminateSubcluster).toHaveBeenCalledWith('subcluster-123');
      expect(controller.get('com.example.test')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns empty array when no caplets installed', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const result = controller.list();

      expect(result).toStrictEqual([]);
    });

    it('returns all installed caplets', async () => {
      const manifest2: CapletManifest = {
        ...makeManifest(),
        id: 'com.example.test2',
        name: 'Test Caplet 2',
      };
      const mockAdapter = makeMockStorageAdapter();
      await seedAdapter(mockAdapter, {
        'com.example.test': {
          manifest: makeManifest(),
          subclusterId: 'subcluster-1',
          rootKref: 'ko1',
          installedAt: 1000,
        },
        'com.example.test2': {
          manifest: manifest2,
          subclusterId: 'subcluster-2',
          rootKref: 'ko2',
          installedAt: 2000,
        },
      });
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const result = controller.list();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        manifest: makeManifest(),
        subclusterId: 'subcluster-1',
        rootKref: 'ko1',
        installedAt: 1000,
      });
      expect(result).toContainEqual({
        manifest: manifest2,
        subclusterId: 'subcluster-2',
        rootKref: 'ko2',
        installedAt: 2000,
      });
    });
  });

  describe('get', () => {
    it('returns caplet if exists', async () => {
      const mockAdapter = makeMockStorageAdapter();
      await seedAdapter(mockAdapter, {
        'com.example.test': {
          manifest: makeManifest(),
          subclusterId: 'subcluster-123',
          rootKref: 'ko1',
          installedAt: 1705320000000,
        },
      });
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const result = controller.get('com.example.test');

      expect(result).toStrictEqual({
        manifest: makeManifest(),
        subclusterId: 'subcluster-123',
        rootKref: 'ko1',
        installedAt: 1705320000000,
      });
    });

    it('returns undefined if caplet not found', async () => {
      const mockAdapter = makeMockStorageAdapter();
      const controller = await CapletController.make(makeConfig(), {
        adapter: mockAdapter,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
        getVatRoot: mockGetVatRoot,
      });

      const result = controller.get('com.example.notfound');

      expect(result).toBeUndefined();
    });
  });
});
