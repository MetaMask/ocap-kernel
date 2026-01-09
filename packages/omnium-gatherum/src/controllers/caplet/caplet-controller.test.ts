import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CapletController } from './caplet-controller.ts';
import type { CapletControllerState } from './caplet-controller.ts';
import type { CapletManifest } from './types.ts';
import type { ControllerStorage } from '../storage/controller-storage.ts';
import type { ControllerConfig } from '../types.ts';

/**
 * Create a mock ControllerStorage for testing.
 * Maintains in-memory state and tracks update calls.
 *
 * @param initialState - The initial state for the mock storage.
 * @returns A mock ControllerStorage instance with update tracking.
 */
function createMockStorage(
  initialState: CapletControllerState,
): ControllerStorage<CapletControllerState> & { updateCalls: (() => void)[] } {
  let currentState = { ...initialState };
  const updateCalls: (() => void)[] = [];

  return {
    get state(): Readonly<CapletControllerState> {
      return harden({ ...currentState });
    },

    async update(
      producer: (draft: CapletControllerState) => void,
    ): Promise<void> {
      // Create a mutable draft
      const draft = JSON.parse(
        JSON.stringify(currentState),
      ) as CapletControllerState;
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

const emptyState: CapletControllerState = {
  caplets: {},
};

describe('CapletController.make', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    subLogger: vi.fn().mockReturnThis(),
  };

  const mockLaunchSubcluster = vi.fn();
  const mockTerminateSubcluster = vi.fn();

  const config: ControllerConfig = {
    logger: mockLogger as unknown as ControllerConfig['logger'],
  };

  const validManifest: CapletManifest = {
    id: 'com.example.test',
    name: 'Test Caplet',
    version: '1.0.0',
    bundleSpec: 'https://example.com/bundle.json',
    requestedServices: ['keyring'],
    providedServices: ['signer'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockLaunchSubcluster).mockResolvedValue({
      subclusterId: 'subcluster-123',
    });
  });

  describe('install', () => {
    it('installs a caplet successfully', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.install(validManifest);

      expect(result).toStrictEqual({
        capletId: 'com.example.test',
        subclusterId: 'subcluster-123',
      });
    });

    it('validates the manifest', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const invalidManifest = { id: 'invalid' } as CapletManifest;

      await expect(controller.install(invalidManifest)).rejects.toThrow(
        'Invalid caplet manifest for invalid',
      );
    });

    it('throws if caplet already installed', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await expect(controller.install(validManifest)).rejects.toThrow(
        'Caplet com.example.test is already installed',
      );
    });

    it('launches subcluster with correct config', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.install(validManifest);

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
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.install(validManifest);

      const caplet = mockStorage.state.caplets['com.example.test'];
      expect(caplet).toBeDefined();
      expect(caplet?.manifest).toStrictEqual(validManifest);
      expect(caplet?.subclusterId).toBe('subcluster-123');
      expect(caplet?.installedAt).toBe(Date.now());

      vi.useRealTimers();
    });

    it('preserves existing caplets when installing', async () => {
      const stateWithOtherCaplet: CapletControllerState = {
        caplets: {
          'com.other.caplet': {
            manifest: { ...validManifest, id: 'com.other.caplet' },
            subclusterId: 'subcluster-other',
            installedAt: 500,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithOtherCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.install(validManifest);

      expect(Object.keys(mockStorage.state.caplets)).toStrictEqual([
        'com.other.caplet',
        'com.example.test',
      ]);
    });

    it('logs installation progress', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.install(validManifest);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Installing caplet: com.example.test',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Caplet com.example.test installed with subcluster subcluster-123',
      );
    });
  });

  describe('uninstall', () => {
    it('uninstalls a caplet successfully', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.uninstall('com.example.test');

      expect(mockTerminateSubcluster).toHaveBeenCalledWith('subcluster-123');
    });

    it('throws if caplet not found', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await expect(
        controller.uninstall('com.example.notfound'),
      ).rejects.toThrow('Caplet com.example.notfound not found');
    });

    it('removes caplet from state', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.uninstall('com.example.test');

      expect(mockStorage.state.caplets['com.example.test']).toBeUndefined();
    });

    it('preserves other caplets when uninstalling', async () => {
      const stateWithCaplets: CapletControllerState = {
        caplets: {
          'com.other.caplet': {
            manifest: { ...validManifest, id: 'com.other.caplet' },
            subclusterId: 'subcluster-other',
            installedAt: 500,
          },
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplets);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.uninstall('com.example.test');

      expect(Object.keys(mockStorage.state.caplets)).toStrictEqual([
        'com.other.caplet',
      ]);
    });

    it('logs uninstallation progress', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      await controller.uninstall('com.example.test');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Uninstalling caplet: com.example.test',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Caplet com.example.test uninstalled',
      );
    });
  });

  describe('list', () => {
    it('returns empty array when no caplets installed', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.list();

      expect(result).toStrictEqual([]);
    });

    it('returns all installed caplets', async () => {
      const manifest2: CapletManifest = {
        ...validManifest,
        id: 'com.example.test2',
        name: 'Test Caplet 2',
      };
      const stateWithCaplets: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-1',
            installedAt: 1000,
          },
          'com.example.test2': {
            manifest: manifest2,
            subclusterId: 'subcluster-2',
            installedAt: 2000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplets);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({
        manifest: validManifest,
        subclusterId: 'subcluster-1',
        installedAt: 1000,
      });
      expect(result).toContainEqual({
        manifest: manifest2,
        subclusterId: 'subcluster-2',
        installedAt: 2000,
      });
    });
  });

  describe('get', () => {
    it('returns caplet if exists', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1705320000000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.get('com.example.test');

      expect(result).toStrictEqual({
        manifest: validManifest,
        subclusterId: 'subcluster-123',
        installedAt: 1705320000000,
      });
    });

    it('returns undefined if caplet not found', async () => {
      const mockStorage = createMockStorage(emptyState);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.get('com.example.notfound');

      expect(result).toBeUndefined();
    });
  });

  describe('getByService', () => {
    it('returns caplet providing the service', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.getByService('signer');

      expect(result).toBeDefined();
      expect(result?.manifest.id).toBe('com.example.test');
    });

    it('returns undefined if no caplet provides the service', async () => {
      const stateWithCaplet: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-123',
            installedAt: 1000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplet);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.getByService('unknown-service');

      expect(result).toBeUndefined();
    });

    it('returns a matching caplet when multiple provide the service', async () => {
      const manifest2: CapletManifest = {
        ...validManifest,
        id: 'com.example.test2',
        name: 'Test Caplet 2',
        providedServices: ['signer', 'verifier'],
      };
      const stateWithCaplets: CapletControllerState = {
        caplets: {
          'com.example.test': {
            manifest: validManifest,
            subclusterId: 'subcluster-1',
            installedAt: 1000,
          },
          'com.example.test2': {
            manifest: manifest2,
            subclusterId: 'subcluster-2',
            installedAt: 2000,
          },
        },
      };
      const mockStorage = createMockStorage(stateWithCaplets);
      const controller = CapletController.make(config, {
        storage: mockStorage,
        launchSubcluster: mockLaunchSubcluster,
        terminateSubcluster: mockTerminateSubcluster,
      });

      const result = await controller.getByService('signer');

      // Returns a match (object key order is not guaranteed)
      expect(result?.manifest.providedServices).toContain('signer');
    });
  });
});
