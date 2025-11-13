import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CapletInstallerService } from './caplet-installer.ts';
import * as registryModule from './caplet-registry.ts';
import * as storageModule from './storage.ts';
import type { CapletManifest } from '../types/caplet.ts';

vi.mock('./storage.ts');
vi.mock('./caplet-registry.ts');

describe('CapletInstallerService', () => {
  let installerService: CapletInstallerService;
  let mockStorage: typeof storageModule.storageService;
  let mockRegistry: typeof registryModule.capletRegistryService;

  beforeEach(() => {
    installerService = new CapletInstallerService();
    mockStorage = storageModule.storageService;
    mockRegistry = registryModule.capletRegistryService;
    vi.clearAllMocks();
  });

  describe('generateCapletId', () => {
    it('generates caplet ID from manifest', () => {
      const manifest: CapletManifest = {
        name: 'test',
        version: '1.0.0',
        bundleSpec: 'http://example.com/bundle',
        clusterConfig: {
          bootstrap: 'test',
          vats: { test: {} },
        },
      };

      const id = installerService.generateCapletId(manifest);

      expect(id).toBe('test@1.0.0');
    });
  });

  describe('validateCaplet', () => {
    it('validates a valid manifest', () => {
      const manifest: CapletManifest = {
        name: 'test',
        version: '1.0.0',
        bundleSpec: 'http://example.com/bundle',
        clusterConfig: {
          bootstrap: 'test',
          vats: { test: {} },
        },
      };

      expect(() => installerService.validateCaplet(manifest)).not.toThrow();
    });

    it('throws on invalid manifest', () => {
      const invalidManifest = {
        name: 'test',
        // Missing required fields
      };

      expect(() => installerService.validateCaplet(invalidManifest)).toThrow();
    });

    it('throws if bootstrap vat not found', () => {
      const manifest: CapletManifest = {
        name: 'test',
        version: '1.0.0',
        bundleSpec: 'http://example.com/bundle',
        clusterConfig: {
          bootstrap: 'missing',
          vats: { test: {} },
        },
      };

      expect(() => installerService.validateCaplet(manifest)).toThrow();
    });
  });

  describe('installCaplet', () => {
    it('installs a caplet successfully', async () => {
      const manifest: CapletManifest = {
        name: 'test',
        version: '1.0.0',
        bundleSpec: 'http://example.com/bundle',
        clusterConfig: {
          bootstrap: 'test',
          vats: { test: {} },
        },
      };

      vi.mocked(mockStorage.getInstalledCaplet).mockResolvedValue(undefined);
      vi.mocked(mockStorage.loadInstalledCaplets).mockResolvedValue([]);
      vi.mocked(mockStorage.saveInstalledCaplets).mockResolvedValue();
      vi.mocked(mockRegistry.fetchCapletBundle).mockResolvedValue(new Blob());

      const result = await installerService.installCaplet(manifest);

      expect(result.id).toBe('test@1.0.0');
      expect(mockStorage.saveInstalledCaplets).toHaveBeenCalled();
    });

    it('throws if caplet already installed', async () => {
      const manifest: CapletManifest = {
        name: 'test',
        version: '1.0.0',
        bundleSpec: 'http://example.com/bundle',
        clusterConfig: {
          bootstrap: 'test',
          vats: { test: {} },
        },
      };

      vi.mocked(mockStorage.getInstalledCaplet).mockResolvedValue({
        id: 'test@1.0.0',
        manifest,
        installedAt: new Date().toISOString(),
        enabled: true,
      });

      await expect(installerService.installCaplet(manifest)).rejects.toThrow();
    });
  });

  describe('uninstallCaplet', () => {
    it('uninstalls a caplet successfully', async () => {
      const capletId = 'test@1.0.0';
      const caplets = [
        {
          id: capletId,
          manifest: {
            name: 'test',
            version: '1.0.0',
            bundleSpec: 'http://example.com/bundle',
            clusterConfig: {
              bootstrap: 'test',
              vats: { test: {} },
            },
          },
          installedAt: new Date().toISOString(),
          enabled: true,
        },
      ];

      vi.mocked(mockStorage.loadInstalledCaplets).mockResolvedValue(caplets);
      vi.mocked(mockStorage.saveInstalledCaplets).mockResolvedValue();

      await installerService.uninstallCaplet(capletId);

      expect(mockStorage.saveInstalledCaplets).toHaveBeenCalledWith([]);
    });

    it('throws if caplet not installed', async () => {
      vi.mocked(mockStorage.loadInstalledCaplets).mockResolvedValue([]);

      await expect(
        installerService.uninstallCaplet('missing@1.0.0'),
      ).rejects.toThrow();
    });
  });
});
