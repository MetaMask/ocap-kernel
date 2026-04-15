import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import type { DelegationGrant } from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * Build the root object for the redeemer vat.
 *
 * @param _vatPowers - Special powers granted to this vat (unused).
 * @param _parameters - Initialization parameters (unused).
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the redeemer vat.
 */
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: unknown,
  baggage: Baggage,
): object {
  // Restore from baggage on resuscitation
  const grants: Map<string, DelegationGrant> = baggage.has('grants')
    ? new Map(
        Object.entries(
          baggage.get('grants') as Record<string, DelegationGrant>,
        ),
      )
    : new Map();

  /**
   * Persist grants map to baggage (handles both init and update).
   */
  function persistGrants(): void {
    const serialized = harden(Object.fromEntries(grants));
    if (baggage.has('grants')) {
      baggage.set('grants', serialized);
    } else {
      baggage.init('grants', serialized);
    }
  }

  return makeDefaultExo('walletRedeemer', {
    async receiveGrant(grant: DelegationGrant): Promise<void> {
      grants.set(grant.delegation.id, grant);
      persistGrants();
    },
    async removeGrant(id: string): Promise<void> {
      grants.delete(id);
      persistGrants();
    },
    async listGrants(): Promise<DelegationGrant[]> {
      return harden([...grants.values()]);
    },
  });
}
