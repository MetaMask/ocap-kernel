import { Logger } from '@metamask/logger';
import type { KRef } from '@metamask/ocap-kernel';

import { storageService } from './storage.ts';
import type {
  CapabilityGrant,
  CapabilityRequest,
  InstalledCaplet,
} from '../types/caplet.ts';

const logger = new Logger('capability-manager');

/**
 * Capability restrictions for attenuation.
 */
export type CapabilityRestrictions = {
  expiresAt?: string; // ISO timestamp
  scope?: string; // Scope identifier
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
};

/**
 * Capability manager service for tracking and managing capability grants.
 */
export class CapabilityManagerService {
  /**
   * Request a capability grant for a caplet.
   *
   * @param capletId - The caplet ID requesting the capability.
   * @param capability - The capability request.
   * @returns The capability request (for user approval).
   */
  requestCapability(
    capletId: string,
    capability: CapabilityRequest,
  ): CapabilityRequest {
    logger.log(`Capability requested: ${capletId} -> ${capability.name}`);
    return capability;
  }

  /**
   * Grant a capability to a caplet.
   *
   * @param capletId - The caplet ID to grant the capability to.
   * @param capabilityName - The name of the capability.
   * @param target - The target object reference (KRef) or service name.
   * @param restrictions - Optional restrictions for capability attenuation.
   * @returns The capability grant.
   */
  async grantCapability(
    capletId: string,
    capabilityName: string,
    target: KRef | string,
    restrictions?: CapabilityRestrictions,
  ): Promise<CapabilityGrant> {
    logger.log(`Granting capability: ${capletId} -> ${capabilityName}`);

    const restrictionsObj = restrictions
      ? {
          ...(restrictions.expiresAt !== undefined && {
            expiresAt: restrictions.expiresAt,
          }),
          ...(restrictions.scope !== undefined && {
            scope: restrictions.scope,
          }),
        }
      : undefined;

    const grant: CapabilityGrant = {
      capletId,
      capabilityName,
      target: String(target),
      grantedAt: new Date().toISOString(),
      ...(restrictionsObj !== undefined && { restrictions: restrictionsObj }),
    };

    const grants = await storageService.loadCapabilityGrants();
    grants.push(grant);
    await storageService.saveCapabilityGrants(grants);

    logger.log(
      `Successfully granted capability: ${capletId} -> ${capabilityName}`,
    );
    return grant;
  }

  /**
   * Revoke a capability from a caplet.
   *
   * @param capletId - The caplet ID to revoke the capability from.
   * @param capabilityName - The name of the capability to revoke.
   */
  async revokeCapability(
    capletId: string,
    capabilityName: string,
  ): Promise<void> {
    logger.log(`Revoking capability: ${capletId} -> ${capabilityName}`);

    const grants = await storageService.loadCapabilityGrants();
    const filtered = grants.filter(
      (grant) =>
        !(
          grant.capletId === capletId && grant.capabilityName === capabilityName
        ),
    );

    if (filtered.length === grants.length) {
      throw new Error(
        `Capability ${capabilityName} not found for caplet ${capletId}`,
      );
    }

    await storageService.saveCapabilityGrants(filtered);
    logger.log(
      `Successfully revoked capability: ${capletId} -> ${capabilityName}`,
    );
  }

  /**
   * List all capabilities granted to a caplet.
   *
   * @param capletId - The caplet ID to list capabilities for.
   * @returns Array of capability grants.
   */
  async listCapabilities(capletId: string): Promise<CapabilityGrant[]> {
    return await storageService.getCapabilityGrantsForCaplet(capletId);
  }

  /**
   * Get all capability grants.
   *
   * @returns Array of all capability grants.
   */
  async getAllGrants(): Promise<CapabilityGrant[]> {
    return await storageService.loadCapabilityGrants();
  }

  /**
   * Check if a capability grant is still valid (not expired).
   *
   * @param grant - The capability grant to check.
   * @returns True if the grant is valid.
   */
  isGrantValid(grant: CapabilityGrant): boolean {
    if (grant.restrictions?.expiresAt) {
      const expiresAt = new Date(grant.restrictions.expiresAt);
      return new Date() < expiresAt;
    }
    return true;
  }

  /**
   * Get valid capabilities for a caplet (filtering out expired grants).
   *
   * @param capletId - The caplet ID to get valid capabilities for.
   * @returns Array of valid capability grants.
   */
  async getValidCapabilities(capletId: string): Promise<CapabilityGrant[]> {
    const grants = await this.listCapabilities(capletId);
    return grants.filter((grant) => this.isGrantValid(grant));
  }

  /**
   * Create an attenuated capability from an original capability.
   * This creates a wrapper that applies restrictions.
   *
   * @param original - The original capability grant.
   * @param restrictions - The restrictions to apply.
   * @returns A new capability grant with restrictions applied.
   */
  attenuateCapability(
    original: CapabilityGrant,
    restrictions: CapabilityRestrictions,
  ): CapabilityGrant {
    logger.log(
      `Attenuating capability: ${original.capletId} -> ${original.capabilityName}`,
    );

    return {
      ...original,
      restrictions: {
        ...original.restrictions,
        ...(restrictions.expiresAt !== undefined && {
          expiresAt: restrictions.expiresAt,
        }),
        ...(restrictions.scope !== undefined && { scope: restrictions.scope }),
      },
    };
  }

  /**
   * Revoke all capabilities for a caplet.
   *
   * @param capletId - The caplet ID to revoke all capabilities for.
   */
  async revokeAllCapabilities(capletId: string): Promise<void> {
    logger.log(`Revoking all capabilities for caplet: ${capletId}`);

    const grants = await storageService.loadCapabilityGrants();
    const filtered = grants.filter((grant) => grant.capletId !== capletId);

    await storageService.saveCapabilityGrants(filtered);
    logger.log(`Successfully revoked all capabilities for caplet: ${capletId}`);
  }

  /**
   * Get capabilities that a caplet requests but hasn't been granted yet.
   *
   * @param caplet - The installed caplet.
   * @returns Array of ungranted capability requests.
   */
  async getUngrantedCapabilities(
    caplet: InstalledCaplet,
  ): Promise<CapabilityRequest[]> {
    const requested = caplet.manifest.capabilities?.requested ?? [];
    const granted = await this.listCapabilities(caplet.id);
    const grantedNames = new Set(granted.map((g) => g.capabilityName));

    return requested.filter((req) => !grantedNames.has(req.name));
  }
}

/**
 * Singleton instance of the capability manager service.
 */
export const capabilityManagerService = new CapabilityManagerService();
