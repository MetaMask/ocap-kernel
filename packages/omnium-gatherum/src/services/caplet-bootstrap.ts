import type { CapData } from '@endo/marshal';
import { Logger } from '@metamask/logger';
import type { ClusterConfig, KRef } from '@metamask/ocap-kernel';

import { capabilityManagerService } from './capability-manager.ts';
import { storageService } from './storage.ts';
import type { InstalledCaplet, CapabilityGrant } from '../types/caplet.ts';

const logger = new Logger('caplet-bootstrap');

/**
 * Caplet bootstrap service for coordinating caplet initialization and capability injection.
 */
export class CapletBootstrapService {
  /**
   * Launch a caplet subcluster with capabilities injected.
   *
   * @param capletId - The caplet ID to bootstrap.
   * @param clusterConfig - The cluster configuration (from manifest).
   * @param launchKernelSubcluster - Function to launch the subcluster via kernel RPC.
   * @returns The bootstrap result (CapData encoded result from bootstrap message).
   */
  async bootstrapCaplet(
    capletId: string,
    clusterConfig: ClusterConfig,
    launchKernelSubcluster: (
      config: ClusterConfig,
    ) => Promise<CapData<KRef> | null>,
  ): Promise<CapData<KRef> | null> {
    logger.log(`Bootstrapping caplet: ${capletId}`);

    // Get installed caplet
    const caplet = await storageService.getInstalledCaplet(capletId);
    if (!caplet) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    // Get valid capabilities for this caplet
    const grants =
      await capabilityManagerService.getValidCapabilities(capletId);

    // Prepare cluster config with capabilities as kernel services
    const enhancedConfig: ClusterConfig = {
      ...clusterConfig,
      services: [
        ...(clusterConfig.services ?? []),
        // Add capability services if needed
        // Capabilities are passed via bootstrap parameters
      ],
    };

    // Launch subcluster
    const result = await launchKernelSubcluster(enhancedConfig);

    // Store subcluster ID if we can extract it
    // Note: The kernel returns the bootstrap result, not the subcluster ID directly
    // We'll need to track this separately or get it from kernel status

    logger.log(`Successfully bootstrapped caplet: ${capletId}`);
    return result;
  }

  /**
   * Inject capabilities into a running caplet.
   * This sends capabilities to the caplet's root object via message.
   *
   * @param capletId - The caplet ID to inject capabilities into.
   * @param capabilities - The capabilities to inject.
   * @param queueMessage - Function to queue a message to a vat object.
   */
  async injectCapabilities(
    capletId: string,
    capabilities: CapabilityGrant[],
    queueMessage: (
      target: KRef,
      method: string,
      args: unknown[],
    ) => Promise<unknown>,
  ): Promise<void> {
    logger.log(`Injecting capabilities into caplet: ${capletId}`);

    const caplet = await storageService.getInstalledCaplet(capletId);
    if (!caplet) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    if (!caplet.subclusterId) {
      throw new Error(`Caplet ${capletId} is not running (no subcluster ID)`);
    }

    // Get the caplet's root object reference
    const rootRef = await this.getCapletRoot(capletId);
    if (!rootRef) {
      throw new Error(`Could not get root object for caplet ${capletId}`);
    }

    // Send capabilities to the caplet
    // The caplet should have a method like `receiveCapabilities` or similar
    await queueMessage(rootRef, 'receiveCapabilities', [capabilities]);

    logger.log(`Successfully injected capabilities into caplet: ${capletId}`);
  }

  /**
   * Get the root object reference for a caplet.
   *
   * @param capletId - The caplet ID.
   * @param getRootObject - Function to get root object from kernel store.
   * @returns The root object KRef, or undefined if not found.
   */
  async getCapletRoot(
    capletId: string,
    getRootObject?: (vatId: string) => KRef | undefined,
  ): Promise<KRef | undefined> {
    const caplet = await storageService.getInstalledCaplet(capletId);
    if (!caplet?.subclusterId) {
      return undefined;
    }

    // If we have access to kernel store, get root object directly
    if (getRootObject) {
      // We need the vat ID, not subcluster ID
      // This would require querying kernel status to get vat IDs for the subcluster
      // For now, return undefined - this will be implemented when we have kernel access
      return undefined;
    }

    return undefined;
  }

  /**
   * Update the subcluster ID for an installed caplet.
   *
   * @param capletId - The caplet ID.
   * @param subclusterId - The subcluster ID.
   */
  async setCapletSubclusterId(
    capletId: string,
    subclusterId: string,
  ): Promise<void> {
    const caplets = await storageService.loadInstalledCaplets();
    const caplet = caplets.find((c) => c.id === capletId);

    if (!caplet) {
      throw new Error(`Caplet ${capletId} is not installed`);
    }

    caplet.subclusterId = subclusterId;
    await storageService.saveInstalledCaplets(caplets);

    logger.log(`Set subcluster ID for caplet ${capletId}: ${subclusterId}`);
  }

  /**
   * Get capabilities to pass to a caplet during bootstrap.
   * This prepares capabilities as objects that can be passed via bootstrap parameters.
   *
   * @param capletId - The caplet ID.
   * @returns Map of capability names to targets (KRefs or service names).
   */
  async getCapabilitiesForBootstrap(
    capletId: string,
  ): Promise<Record<string, KRef | string>> {
    const grants =
      await capabilityManagerService.getValidCapabilities(capletId);
    const capabilities: Record<string, KRef | string> = {};

    for (const grant of grants) {
      capabilities[grant.capabilityName] = grant.target;
    }

    return capabilities;
  }
}

/**
 * Singleton instance of the caplet bootstrap service.
 */
export const capletBootstrapService = new CapletBootstrapService();
