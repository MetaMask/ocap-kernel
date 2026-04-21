import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import {
  ENFORCER_CONTRACT_KEY_MAP,
  PLACEHOLDER_CONTRACTS,
  registerChainContracts,
} from '../constants.ts';
import type { ChainContracts } from '../constants.ts';
import {
  makeCaveat,
  encodeValueLte,
  encodeNativeTokenTransferAmount,
  encodeAllowedTargets,
  encodeAllowedMethods,
  encodeErc20TransferAmount,
  encodeAllowedCalldata,
} from '../lib/caveats.ts';
import { makeDelegation, makeSaltGenerator } from '../lib/delegation.ts';
import { ERC20_TRANSFER_SELECTOR, FIRST_ARG_OFFSET } from '../lib/erc20.ts';
import type {
  Address,
  DelegationGrant,
  Hex,
  TransferFungibleGrant,
  TransferNativeGrant,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * ABI-encode an Ethereum address as a 32-byte padded hex value.
 *
 * @param address - The Ethereum address to encode.
 * @returns A 0x-prefixed 64-character hex string.
 */
function abiEncodeAddress(address: Address): Hex {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}

/**
 * Build the root object for the delegator vat.
 *
 * @param _vatPowers - Special powers granted to this vat (unused).
 * @param _parameters - Initialization parameters (unused).
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the delegator vat.
 */
export function buildRootObject(
  _vatPowers: unknown,
  _parameters: unknown,
  baggage: Baggage,
): object {
  const grants: Map<string, DelegationGrant> = baggage.has('grants')
    ? new Map(
        Object.entries(
          baggage.get('grants') as Record<string, DelegationGrant>,
        ),
      )
    : new Map();

  const saltGenerator = makeSaltGenerator();

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

  return makeDefaultExo('walletDelegator', {
    async buildTransferNativeGrant(options: {
      delegator: Address;
      delegate: Address;
      to?: Address;
      maxAmount?: bigint;
      totalLimit?: bigint;
      chainId: number;
    }): Promise<TransferNativeGrant> {
      const { delegator, delegate, to, maxAmount, totalLimit, chainId } =
        options;
      const caveats = [];

      if (to !== undefined) {
        caveats.push(
          makeCaveat({
            type: 'allowedTargets',
            terms: encodeAllowedTargets([to]),
            chainId,
          }),
        );
      }

      if (totalLimit !== undefined) {
        caveats.push(
          makeCaveat({
            type: 'nativeTokenTransferAmount',
            terms: encodeNativeTokenTransferAmount(totalLimit),
            chainId,
          }),
        );
      }

      if (maxAmount !== undefined) {
        caveats.push(
          makeCaveat({
            type: 'valueLte',
            terms: encodeValueLte(maxAmount),
            chainId,
          }),
        );
      }

      const delegation = makeDelegation({
        delegator,
        delegate,
        caveats,
        chainId,
        saltGenerator,
      });

      return harden({
        method: 'transferNative',
        ...(to !== undefined && { to }),
        ...(maxAmount !== undefined && { maxAmount }),
        ...(totalLimit !== undefined && { totalLimit }),
        delegation,
      });
    },

    async buildTransferFungibleGrant(options: {
      delegator: Address;
      delegate: Address;
      token: Address;
      to?: Address;
      maxAmount?: bigint;
      chainId: number;
    }): Promise<TransferFungibleGrant> {
      const { delegator, delegate, token, to, maxAmount, chainId } = options;
      const caveats = [
        makeCaveat({
          type: 'allowedTargets',
          terms: encodeAllowedTargets([token]),
          chainId,
        }),
        makeCaveat({
          type: 'allowedMethods',
          terms: encodeAllowedMethods([ERC20_TRANSFER_SELECTOR]),
          chainId,
        }),
      ];

      if (maxAmount !== undefined) {
        caveats.push(
          makeCaveat({
            type: 'erc20TransferAmount',
            terms: encodeErc20TransferAmount({ token, amount: maxAmount }),
            chainId,
          }),
        );
      }

      if (to !== undefined) {
        caveats.push(
          makeCaveat({
            type: 'allowedCalldata',
            terms: encodeAllowedCalldata({
              dataStart: FIRST_ARG_OFFSET,
              value: abiEncodeAddress(to),
            }),
            chainId,
          }),
        );
      }

      const delegation = makeDelegation({
        delegator,
        delegate,
        caveats,
        chainId,
        saltGenerator,
      });

      return harden({
        method: 'transferFungible',
        token,
        ...(to !== undefined && { to }),
        ...(maxAmount !== undefined && { maxAmount }),
        delegation,
      });
    },

    /**
     * Register contract addresses for a chain so caveat builders can look up
     * enforcer addresses. Called by the home coordinator after configureBundler
     * and on resuscitation so this vat's module-level Map stays in sync.
     *
     * @param chainId - The chain ID to register.
     * @param environment - The deployed contract addresses for this chain.
     * @param environment.DelegationManager - DelegationManager address.
     * @param environment.caveatEnforcers - Enforcer contract addresses.
     */
    async registerContracts(
      chainId: number,
      environment: {
        DelegationManager: Hex;
        caveatEnforcers?: Record<string, Hex>;
      },
    ): Promise<void> {
      const rawEnforcers = environment.caveatEnforcers ?? {};
      const enforcers = { ...PLACEHOLDER_CONTRACTS.enforcers };
      for (const [key, addr] of Object.entries(rawEnforcers)) {
        const caveatType = ENFORCER_CONTRACT_KEY_MAP[key];
        if (caveatType !== undefined) {
          enforcers[caveatType] = addr;
        }
      }
      registerChainContracts(chainId, {
        delegationManager: environment.DelegationManager,
        enforcers,
      } as ChainContracts);
    },

    async storeGrant(grant: DelegationGrant): Promise<void> {
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
