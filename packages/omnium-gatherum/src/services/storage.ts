import { Logger } from '@metamask/logger';

import type { InstalledCaplet, CapabilityGrant } from '../types/caplet.ts';

const logger = new Logger('storage');

const STORAGE_KEYS = {
  INSTALLED_CAPLETS: 'installedCaplets',
  CAPABILITY_GRANTS: 'capabilityGrants',
} as const;

/**
 * Storage service for persisting caplet and capability data.
 */
export class StorageService {
  /**
   * Save installed caplets to storage.
   *
   * @param caplets - Array of installed caplets to save.
   */
  async saveInstalledCaplets(caplets: InstalledCaplet[]): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.INSTALLED_CAPLETS]: caplets,
      });
      logger.log(`Saved ${caplets.length} installed caplets`);
    } catch (error) {
      logger.error('Failed to save installed caplets', error);
      throw error;
    }
  }

  /**
   * Load installed caplets from storage.
   *
   * @returns Array of installed caplets.
   */
  async loadInstalledCaplets(): Promise<InstalledCaplet[]> {
    try {
      const result = await chrome.storage.local.get(
        STORAGE_KEYS.INSTALLED_CAPLETS,
      );
      const caplets = result[STORAGE_KEYS.INSTALLED_CAPLETS] ?? [];
      logger.log(`Loaded ${caplets.length} installed caplets`);
      return caplets as InstalledCaplet[];
    } catch (error) {
      logger.error('Failed to load installed caplets', error);
      return [];
    }
  }

  /**
   * Get a specific installed caplet by ID.
   *
   * @param capletId - The caplet ID to retrieve.
   * @returns The installed caplet or undefined if not found.
   */
  async getInstalledCaplet(
    capletId: string,
  ): Promise<InstalledCaplet | undefined> {
    const caplets = await this.loadInstalledCaplets();
    return caplets.find((caplet) => caplet.id === capletId);
  }

  /**
   * Save capability grants to storage.
   *
   * @param grants - Array of capability grants to save.
   */
  async saveCapabilityGrants(grants: CapabilityGrant[]): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.CAPABILITY_GRANTS]: grants,
      });
      logger.log(`Saved ${grants.length} capability grants`);
    } catch (error) {
      logger.error('Failed to save capability grants', error);
      throw error;
    }
  }

  /**
   * Load capability grants from storage.
   *
   * @returns Array of capability grants.
   */
  async loadCapabilityGrants(): Promise<CapabilityGrant[]> {
    try {
      const result = await chrome.storage.local.get(
        STORAGE_KEYS.CAPABILITY_GRANTS,
      );
      const grants = result[STORAGE_KEYS.CAPABILITY_GRANTS] ?? [];
      logger.log(`Loaded ${grants.length} capability grants`);
      return grants as CapabilityGrant[];
    } catch (error) {
      logger.error('Failed to load capability grants', error);
      return [];
    }
  }

  /**
   * Get capability grants for a specific caplet.
   *
   * @param capletId - The caplet ID to get grants for.
   * @returns Array of capability grants for the caplet.
   */
  async getCapabilityGrantsForCaplet(
    capletId: string,
  ): Promise<CapabilityGrant[]> {
    const grants = await this.loadCapabilityGrants();
    return grants.filter((grant) => grant.capletId === capletId);
  }

  /**
   * Clear all stored data.
   */
  async clearAll(): Promise<void> {
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.INSTALLED_CAPLETS,
        STORAGE_KEYS.CAPABILITY_GRANTS,
      ]);
      logger.log('Cleared all storage');
    } catch (error) {
      logger.error('Failed to clear storage', error);
      throw error;
    }
  }
}

/**
 * Singleton instance of the storage service.
 */
export const storageService = new StorageService();
