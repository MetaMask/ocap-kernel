import { Logger } from '@metamask/logger';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import { is } from '@metamask/superstruct';

import { capletRegistryService } from './caplet-registry.ts';
import { storageService } from './storage.ts';
import type {
  CapletManifest,
  InstalledCaplet,
  CapabilityRequest,
} from '../types/caplet.ts';
import { CapletManifestStruct } from '../types/caplet.ts';

const logger = new Logger('caplet-installer');

/**
 * User approvals for capability requests.
 */
export type CapabilityApprovals = Record<string, boolean>;

/**
 * Caplet installer service for managing caplet installation lifecycle.
 */
export class CapletInstallerService {
  /**
   * Generate a unique caplet ID from manifest.
   *
   * @param manifest - The caplet manifest.
   * @returns The caplet ID.
   */
  generateCapletId(manifest: CapletManifest): string {
    return `${manifest.name}@${manifest.version}`;
  }

  /**
   * Validate a caplet manifest.
   *
   * @param manifest - The manifest to validate.
   * @throws If the manifest is invalid.
   */
  validateCaplet(manifest: unknown): asserts manifest is CapletManifest {
    if (!is(manifest, CapletManifestStruct)) {
      throw new Error('Invalid caplet manifest structure');
    }

    // Validate that bundleSpec is accessible
    // This is a basic check - actual bundle fetching happens during installation
    if (!manifest.bundleSpec || typeof manifest.bundleSpec !== 'string') {
      throw new Error('Invalid bundleSpec in manifest');
    }

    // Validate cluster config structure
    if (!manifest.clusterConfig?.bootstrap) {
      throw new Error('Invalid clusterConfig in manifest');
    }

    if (
      !manifest.clusterConfig.vats ||
      Object.keys(manifest.clusterConfig.vats).length === 0
    ) {
      throw new Error('Cluster config must have at least one vat');
    }

    if (!manifest.clusterConfig.vats[manifest.clusterConfig.bootstrap]) {
      throw new Error(
        `Bootstrap vat '${manifest.clusterConfig.bootstrap}' not found in vats`,
      );
    }
  }

  /**
   * Install a caplet with user capability approvals.
   *
   * @param manifest - The caplet manifest to install.
   * @param userApprovals - User approvals for capability requests.
   * @param launchKernelSubcluster - Function to launch the subcluster via kernel RPC.
   * @returns The installed caplet metadata.
   */
  async installCaplet(
    manifest: CapletManifest,
    userApprovals: CapabilityApprovals = {},
    launchKernelSubcluster?: (config: ClusterConfig) => Promise<unknown>,
  ): Promise<InstalledCaplet> {
    logger.log(`Installing caplet: ${manifest.name}@${manifest.version}`);

    // Validate manifest
    this.validateCaplet(manifest);

    // Check if already installed
    const capletId = this.generateCapletId(manifest);
    const existing = await storageService.getInstalledCaplet(capletId);
    if (existing) {
      throw new Error(`Caplet ${capletId} is already installed`);
    }

    // Verify bundle is accessible (basic check)
    try {
      const source = manifest.registry?.source ?? 'url';
      await capletRegistryService.fetchCapletBundle(
        manifest.bundleSpec,
        source,
      );
    } catch (error) {
      throw new Error(
        `Failed to fetch caplet bundle: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Create installed caplet record
    const installedCaplet: InstalledCaplet = {
      id: capletId,
      manifest,
      installedAt: new Date().toISOString(),
      enabled: true,
    };

    // Launch subcluster if launch function provided
    if (launchKernelSubcluster) {
      try {
        await launchKernelSubcluster(manifest.clusterConfig);
        logger.log(`Launched subcluster for caplet ${capletId}`);
      } catch (error) {
        logger.error(
          `Failed to launch subcluster for caplet ${capletId}`,
          error,
        );
        // Don't fail installation if subcluster launch fails - it can be launched later
      }
    }

    // Save to storage
    const caplets = await storageService.loadInstalledCaplets();
    caplets.push(installedCaplet);
    await storageService.saveInstalledCaplets(caplets);

    logger.log(`Successfully installed caplet: ${capletId}`);
    return installedCaplet;
  }

  /**
   * Uninstall a caplet.
   *
   * @param capletId - The caplet ID to uninstall.
   * @param terminateKernelSubcluster - Optional function to terminate the subcluster.
   */
  async uninstallCaplet(
    capletId: string,
    terminateKernelSubcluster?: (subclusterId: string) => Promise<void>,
  ): Promise<void> {
    logger.log(`Uninstalling caplet: ${capletId}`);

    const caplets = await storageService.loadInstalledCaplets();
    const index = caplets.findIndex((c) => c.id === capletId);

    if (index === -1) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    const caplet = caplets[index]!;

    // Terminate subcluster if it exists and termination function provided
    if (caplet.subclusterId && terminateKernelSubcluster) {
      try {
        await terminateKernelSubcluster(caplet.subclusterId);
        logger.log(
          `Terminated subcluster ${caplet.subclusterId} for caplet ${capletId}`,
        );
      } catch (error) {
        logger.error(
          `Failed to terminate subcluster for caplet ${capletId}`,
          error,
        );
        // Continue with uninstallation even if termination fails
      }
    }

    // Remove from storage
    caplets.splice(index, 1);
    await storageService.saveInstalledCaplets(caplets);

    logger.log(`Successfully uninstalled caplet: ${capletId}`);
  }

  /**
   * Update a caplet to a new version.
   *
   * @param capletId - The caplet ID to update.
   * @param newVersion - The new version to install.
   * @param launchKernelSubcluster - Function to launch the subcluster via kernel RPC.
   * @param terminateKernelSubcluster - Function to terminate the subcluster.
   * @returns The updated installed caplet metadata.
   */
  async updateCaplet(
    capletId: string,
    newVersion: string,
    launchKernelSubcluster?: (config: ClusterConfig) => Promise<unknown>,
    terminateKernelSubcluster?: (subclusterId: string) => Promise<void>,
  ): Promise<InstalledCaplet> {
    logger.log(`Updating caplet ${capletId} to version ${newVersion}`);

    const existing = await storageService.getInstalledCaplet(capletId);
    if (!existing) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    // Fetch new manifest
    const source = existing.manifest.registry?.source ?? 'url';
    const location =
      existing.manifest.registry?.location ?? existing.manifest.bundleSpec;
    const newManifest = await capletRegistryService.fetchCapletManifest(
      source,
      location,
      newVersion,
    );

    // Validate new manifest
    this.validateCaplet(newManifest);

    // Uninstall old version
    await this.uninstallCaplet(capletId, terminateKernelSubcluster);

    // Install new version
    const updated = await this.installCaplet(
      newManifest,
      {}, // Preserve existing approvals if needed
      launchKernelSubcluster,
    );

    logger.log(
      `Successfully updated caplet ${capletId} to version ${newVersion}`,
    );
    return updated;
  }

  /**
   * Get all installed caplets.
   *
   * @returns Array of installed caplets.
   */
  async getInstalledCaplets(): Promise<InstalledCaplet[]> {
    return await storageService.loadInstalledCaplets();
  }

  /**
   * Get a specific installed caplet.
   *
   * @param capletId - The caplet ID to retrieve.
   * @returns The installed caplet or undefined if not found.
   */
  async getInstalledCaplet(
    capletId: string,
  ): Promise<InstalledCaplet | undefined> {
    return await storageService.getInstalledCaplet(capletId);
  }

  /**
   * Enable or disable a caplet.
   *
   * @param capletId - The caplet ID to enable/disable.
   * @param enabled - Whether to enable or disable the caplet.
   */
  async setCapletEnabled(capletId: string, enabled: boolean): Promise<void> {
    const caplets = await storageService.loadInstalledCaplets();
    const caplet = caplets.find((c) => c.id === capletId);

    if (!caplet) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    caplet.enabled = enabled;
    await storageService.saveInstalledCaplets(caplets);

    logger.log(`${enabled ? 'Enabled' : 'Disabled'} caplet: ${capletId}`);
  }
}

/**
 * Singleton instance of the caplet installer service.
 */
export const capletInstallerService = new CapletInstallerService();
