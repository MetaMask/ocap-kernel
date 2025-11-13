import { describe, it, expect, beforeEach, vi } from 'vitest';

import { StorageService } from './storage.ts';
import type { InstalledCaplet, CapabilityGrant } from '../types/caplet.ts';

// Mock chrome.storage
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
};

vi.stubGlobal('chrome', {
  storage: mockStorage,
});

describe('StorageService', () => {
  let storageService: StorageService;

  beforeEach(() => {
    storageService = new StorageService();
    vi.clearAllMocks();
  });

  describe('saveInstalledCaplets', () => {
    it('saves installed caplets to storage', async () => {
      const caplets: InstalledCaplet[] = [
        {
          id: 'test@1.0.0',
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

      mockStorage.local.set.mockResolvedValue(undefined);

      await storageService.saveInstalledCaplets(caplets);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        installedCaplets: caplets,
      });
    });
  });

  describe('loadInstalledCaplets', () => {
    it('loads installed caplets from storage', async () => {
      const caplets: InstalledCaplet[] = [
        {
          id: 'test@1.0.0',
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

      mockStorage.local.get.mockResolvedValue({
        installedCaplets: caplets,
      });

      const result = await storageService.loadInstalledCaplets();

      expect(result).toStrictEqual(caplets);
      expect(mockStorage.local.get).toHaveBeenCalledWith('installedCaplets');
    });

    it('returns empty array if no caplets stored', async () => {
      mockStorage.local.get.mockResolvedValue({});

      const result = await storageService.loadInstalledCaplets();

      expect(result).toStrictEqual([]);
    });
  });

  describe('saveCapabilityGrants', () => {
    it('saves capability grants to storage', async () => {
      const grants: CapabilityGrant[] = [
        {
          capletId: 'test@1.0.0',
          capabilityName: 'test-capability',
          target: 'ko1',
          grantedAt: new Date().toISOString(),
        },
      ];

      mockStorage.local.set.mockResolvedValue(undefined);

      await storageService.saveCapabilityGrants(grants);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        capabilityGrants: grants,
      });
    });
  });

  describe('loadCapabilityGrants', () => {
    it('loads capability grants from storage', async () => {
      const grants: CapabilityGrant[] = [
        {
          capletId: 'test@1.0.0',
          capabilityName: 'test-capability',
          target: 'ko1',
          grantedAt: new Date().toISOString(),
        },
      ];

      mockStorage.local.get.mockResolvedValue({
        capabilityGrants: grants,
      });

      const result = await storageService.loadCapabilityGrants();

      expect(result).toStrictEqual(grants);
    });
  });

  describe('getCapabilityGrantsForCaplet', () => {
    it('filters grants by caplet ID', async () => {
      const grants: CapabilityGrant[] = [
        {
          capletId: 'test@1.0.0',
          capabilityName: 'cap1',
          target: 'ko1',
          grantedAt: new Date().toISOString(),
        },
        {
          capletId: 'other@1.0.0',
          capabilityName: 'cap2',
          target: 'ko2',
          grantedAt: new Date().toISOString(),
        },
      ];

      mockStorage.local.get.mockResolvedValue({
        capabilityGrants: grants,
      });

      const result =
        await storageService.getCapabilityGrantsForCaplet('test@1.0.0');

      expect(result).toHaveLength(1);
      expect(result[0]?.capletId).toBe('test@1.0.0');
    });
  });
});
