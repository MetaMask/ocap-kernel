import { describe, it, expect, vi, beforeEach } from 'vitest';

import { makeCapletController } from './caplet-controller.ts';
import type { CapletManifest } from './types.ts';
import type { NamespacedStorage } from '../storage/types.ts';
import type { ControllerConfig } from '../types.ts';

describe('makeCapletController', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    subLogger: vi.fn().mockReturnThis(),
  };

  const mockStorage: NamespacedStorage = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    keys: vi.fn(),
    clear: vi.fn(),
  };

  const mockLaunchSubcluster = vi.fn();
  const mockTerminateSubcluster = vi.fn();

  const config: ControllerConfig = {
    logger: mockLogger as unknown as ControllerConfig['logger'],
  };

  const deps = {
    storage: mockStorage,
    launchSubcluster: mockLaunchSubcluster,
    terminateSubcluster: mockTerminateSubcluster,
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
    vi.mocked(mockStorage.has).mockResolvedValue(false);
    vi.mocked(mockStorage.keys).mockResolvedValue([]);
    vi.mocked(mockLaunchSubcluster).mockResolvedValue({
      subclusterId: 'subcluster-123',
    });
  });

  describe('install', () => {
    it('installs a caplet successfully', async () => {
      const controller = makeCapletController(config, deps);
      const result = await controller.install(validManifest);

      expect(result).toStrictEqual({
        capletId: 'com.example.test',
        subclusterId: 'subcluster-123',
      });
    });

    it('validates the manifest', async () => {
      const controller = makeCapletController(config, deps);
      const invalidManifest = { id: 'invalid' } as CapletManifest;

      await expect(controller.install(invalidManifest)).rejects.toThrow(
        'Invalid caplet manifest for invalid',
      );
    });

    it('throws if caplet already installed', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);

      await expect(controller.install(validManifest)).rejects.toThrow(
        'Caplet com.example.test is already installed',
      );
    });

    it('launches subcluster with correct config', async () => {
      const controller = makeCapletController(config, deps);
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

    it('stores manifest, subclusterId, and installedAt', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      const controller = makeCapletController(config, deps);
      await controller.install(validManifest);

      expect(mockStorage.set).toHaveBeenCalledWith(
        'com.example.test.manifest',
        validManifest,
      );
      expect(mockStorage.set).toHaveBeenCalledWith(
        'com.example.test.subclusterId',
        'subcluster-123',
      );
      expect(mockStorage.set).toHaveBeenCalledWith(
        'com.example.test.installedAt',
        Date.now(),
      );

      vi.useRealTimers();
    });

    it('updates installed list', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.other.caplet'];
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      await controller.install(validManifest);

      expect(mockStorage.set).toHaveBeenCalledWith('installed', [
        'com.other.caplet',
        'com.example.test',
      ]);
    });

    it('does not duplicate caplet id in installed list', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.example.test'];
        }
        // Return undefined for manifest to allow install to proceed
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      await controller.install(validManifest);

      // Should not add duplicate
      expect(mockStorage.set).not.toHaveBeenCalledWith('installed', [
        'com.example.test',
        'com.example.test',
      ]);
    });

    it('logs installation progress', async () => {
      const controller = makeCapletController(config, deps);
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
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'installed') {
          return ['com.example.test'];
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      await controller.uninstall('com.example.test');

      expect(mockTerminateSubcluster).toHaveBeenCalledWith('subcluster-123');
    });

    it('throws if caplet not found', async () => {
      const controller = makeCapletController(config, deps);

      await expect(
        controller.uninstall('com.example.notfound'),
      ).rejects.toThrow('Caplet com.example.notfound not found');
    });

    it('removes all caplet data from storage', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'installed') {
          return ['com.example.test'];
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      await controller.uninstall('com.example.test');

      expect(mockStorage.delete).toHaveBeenCalledWith(
        'com.example.test.manifest',
      );
      expect(mockStorage.delete).toHaveBeenCalledWith(
        'com.example.test.subclusterId',
      );
      expect(mockStorage.delete).toHaveBeenCalledWith(
        'com.example.test.installedAt',
      );
    });

    it('updates installed list', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'installed') {
          return ['com.other.caplet', 'com.example.test'];
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      await controller.uninstall('com.example.test');

      expect(mockStorage.set).toHaveBeenCalledWith('installed', [
        'com.other.caplet',
      ]);
    });

    it('logs uninstallation progress', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'installed') {
          return ['com.example.test'];
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
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
      const controller = makeCapletController(config, deps);
      const result = await controller.list();

      expect(result).toStrictEqual([]);
    });

    it('returns all installed caplets', async () => {
      const manifest2: CapletManifest = {
        ...validManifest,
        id: 'com.example.test2',
        name: 'Test Caplet 2',
      };

      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.example.test', 'com.example.test2'];
        }
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-1';
        }
        if (key === 'com.example.test.installedAt') {
          return 1000;
        }
        if (key === 'com.example.test2.manifest') {
          return manifest2;
        }
        if (key === 'com.example.test2.subclusterId') {
          return 'subcluster-2';
        }
        if (key === 'com.example.test2.installedAt') {
          return 2000;
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual({
        manifest: validManifest,
        subclusterId: 'subcluster-1',
        installedAt: 1000,
      });
      expect(result[1]).toStrictEqual({
        manifest: manifest2,
        subclusterId: 'subcluster-2',
        installedAt: 2000,
      });
    });

    it('skips caplets with missing data', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.example.test', 'com.example.missing'];
        }
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-1';
        }
        if (key === 'com.example.test.installedAt') {
          return 1000;
        }
        // com.example.missing has no data
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.manifest.id).toBe('com.example.test');
    });
  });

  describe('get', () => {
    it('returns caplet if exists', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'com.example.test.installedAt') {
          return 1705320000000;
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.get('com.example.test');

      expect(result).toStrictEqual({
        manifest: validManifest,
        subclusterId: 'subcluster-123',
        installedAt: 1705320000000,
      });
    });

    it('returns undefined if caplet not found', async () => {
      const controller = makeCapletController(config, deps);
      const result = await controller.get('com.example.notfound');

      expect(result).toBeUndefined();
    });

    it('returns undefined and logs warning if storage data corrupted', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        // Missing subclusterId and installedAt
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.get('com.example.test');

      expect(result).toBeUndefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Caplet com.example.test has corrupted storage data',
      );
    });
  });

  describe('getByService', () => {
    it('returns caplet providing the service', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.example.test'];
        }
        if (key === 'com.example.test.manifest') {
          return validManifest; // providedServices: ['signer']
        }
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'com.example.test.installedAt') {
          return 1000;
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.getByService('signer');

      expect(result).toBeDefined();
      expect(result?.manifest.id).toBe('com.example.test');
    });

    it('returns undefined if no caplet provides the service', async () => {
      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.example.test'];
        }
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-123';
        }
        if (key === 'com.example.test.installedAt') {
          return 1000;
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.getByService('unknown-service');

      expect(result).toBeUndefined();
    });

    it('returns first matching caplet when multiple provide the service', async () => {
      const manifest2: CapletManifest = {
        ...validManifest,
        id: 'com.example.test2',
        name: 'Test Caplet 2',
        providedServices: ['signer', 'verifier'],
      };

      vi.mocked(mockStorage.get).mockImplementation(async (key: string) => {
        if (key === 'installed') {
          return ['com.example.test', 'com.example.test2'];
        }
        if (key === 'com.example.test.manifest') {
          return validManifest;
        }
        if (key === 'com.example.test.subclusterId') {
          return 'subcluster-1';
        }
        if (key === 'com.example.test.installedAt') {
          return 1000;
        }
        if (key === 'com.example.test2.manifest') {
          return manifest2;
        }
        if (key === 'com.example.test2.subclusterId') {
          return 'subcluster-2';
        }
        if (key === 'com.example.test2.installedAt') {
          return 2000;
        }
        return undefined;
      });

      const controller = makeCapletController(config, deps);
      const result = await controller.getByService('signer');

      // Returns first match
      expect(result?.manifest.id).toBe('com.example.test');
    });
  });
});
