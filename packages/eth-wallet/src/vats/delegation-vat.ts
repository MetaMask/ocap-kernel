import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import { DEFAULT_DELEGATION_MANAGER } from '../constants.ts';
import {
  computeDelegationId,
  makeDelegation,
  prepareDelegationTypedData,
  delegationMatchesAction,
  finalizeDelegation,
} from '../lib/delegation.ts';
import type {
  Action,
  Address,
  CreateDelegationOptions,
  Delegation,
  Eip712TypedData,
  Hex,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * Vat powers for the delegation vat.
 */
type VatPowers = Record<string, unknown>;

/**
 * Build the root object for the delegation vat.
 *
 * The delegation vat manages Gator delegations: creating, storing,
 * signing, matching, and revoking them.
 *
 * @param _vatPowers - Special powers granted to this vat.
 * @param parameters - Initialization parameters.
 * @param parameters.delegationManagerAddress - The delegation manager contract address.
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the delegation vat.
 */
export function buildRootObject(
  _vatPowers: VatPowers,
  parameters: { delegationManagerAddress?: Address } | undefined,
  baggage: Baggage,
): object {
  const delegationManagerAddress =
    parameters?.delegationManagerAddress ?? DEFAULT_DELEGATION_MANAGER;

  // Restore delegations from baggage
  const delegations: Map<string, Delegation> = baggage.has('delegations')
    ? new Map(
        Object.entries(
          baggage.get('delegations') as Record<string, Delegation>,
        ),
      )
    : new Map();

  /**
   * Persist the current delegations map to baggage.
   */
  function persistDelegations(): void {
    const serialized = harden(Object.fromEntries(delegations));
    if (baggage.has('delegations')) {
      baggage.set('delegations', serialized);
    } else {
      baggage.init('delegations', serialized);
    }
  }

  return makeDefaultExo('walletDelegation', {
    async bootstrap(): Promise<void> {
      // No services needed for the delegation vat
    },

    async createDelegation(
      options: CreateDelegationOptions & { delegator: Address },
    ): Promise<Delegation> {
      const delegation = harden(
        makeDelegation({
          delegator: options.delegator,
          delegate: options.delegate,
          caveats: options.caveats,
          chainId: options.chainId,
          ...(options.salt ? { salt: options.salt } : {}),
        }),
      );
      delegations.set(delegation.id, delegation);
      persistDelegations();
      return delegation;
    },

    async prepareDelegationForSigning(id: string): Promise<Eip712TypedData> {
      const delegation = delegations.get(id);
      if (!delegation) {
        throw new Error(`Delegation not found: ${id}`);
      }
      return harden(
        prepareDelegationTypedData({
          delegation,
          verifyingContract: delegationManagerAddress,
        }),
      );
    },

    async storeSigned(id: string, signature: Hex): Promise<void> {
      const delegation = delegations.get(id);
      if (!delegation) {
        throw new Error(`Delegation not found: ${id}`);
      }
      const signed = harden(finalizeDelegation(delegation, signature));
      delegations.set(id, signed);
      persistDelegations();
    },

    async receiveDelegation(delegation: Delegation): Promise<void> {
      if (delegation.status !== 'signed') {
        throw new Error('Can only receive signed delegations');
      }
      if (!delegation.signature) {
        throw new Error('Delegation has no signature');
      }

      // Verify the delegation ID is consistent with the fields
      const expectedId = computeDelegationId(delegation);
      if (delegation.id !== expectedId) {
        throw new Error('Delegation ID mismatch');
      }

      // Signature verification is skipped here. When the delegator is a
      // smart account, the EIP-712 signature is made by the underlying
      // EOA owner — ecrecover returns the EOA, not the smart account
      // address. The on-chain DelegationManager performs the authoritative
      // signature check during delegation redemption.

      delegations.set(delegation.id, delegation);
      persistDelegations();
    },

    async findDelegationForAction(
      action: Action,
      chainId?: number,
    ): Promise<Delegation | undefined> {
      for (const delegation of delegations.values()) {
        if (chainId !== undefined && delegation.chainId !== chainId) {
          continue;
        }
        if (delegationMatchesAction(delegation, action)) {
          return delegation;
        }
      }
      return undefined;
    },

    async getDelegation(id: string): Promise<Delegation> {
      const delegation = delegations.get(id);
      if (!delegation) {
        throw new Error(`Delegation not found: ${id}`);
      }
      return harden(delegation);
    },

    async listDelegations(): Promise<Delegation[]> {
      return harden([...delegations.values()]);
    },

    async revokeDelegation(id: string): Promise<void> {
      const delegation = delegations.get(id);
      if (!delegation) {
        throw new Error(`Delegation not found: ${id}`);
      }
      delegations.set(
        id,
        harden({ ...delegation, status: 'revoked' as const }),
      );
      persistDelegations();
    },
  });
}
