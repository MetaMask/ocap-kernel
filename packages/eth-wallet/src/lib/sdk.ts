/**
 * SDK adapter — single integration point for `@metamask/smart-accounts-kit`.
 *
 * All other files import from this module, never directly from the SDK.
 * This isolates the external dependency and maps between our types and SDK types.
 *
 * @module lib/sdk
 */

import {
  createExecution as sdkCreateExecution,
  getSmartAccountsEnvironment,
  Implementation,
  ExecutionMode,
  contracts,
} from '@metamask/smart-accounts-kit';
import type {
  SmartAccountsEnvironment,
  Delegation as SdkDelegation,
} from '@metamask/smart-accounts-kit';
import {
  encodeDelegations as sdkEncodeDelegations,
  getCounterfactualAccountData,
} from '@metamask/smart-accounts-kit/utils';

import type {
  Address,
  CaveatType,
  Delegation,
  Execution,
  Hex,
} from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

// ---------------------------------------------------------------------------
// Re-exports for external callers
// ---------------------------------------------------------------------------

export { Implementation, ExecutionMode };
export type { SmartAccountsEnvironment, SdkDelegation };

// ---------------------------------------------------------------------------
// Environment resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the SDK environment for a chain ID.
 *
 * @param chainId - The chain ID.
 * @returns The SDK environment.
 */
export function resolveEnvironment(chainId: number): SmartAccountsEnvironment {
  return getSmartAccountsEnvironment(chainId);
}

/**
 * Get the DelegationManager address from the SDK environment.
 *
 * @param chainId - The chain ID.
 * @returns The DelegationManager address.
 */
export function getDelegationManagerAddress(chainId: number): Address {
  return resolveEnvironment(chainId).DelegationManager;
}

/**
 * Map SDK caveat enforcer names to our CaveatType keys.
 */
const SDK_ENFORCER_KEYS: Record<CaveatType, string> = {
  allowedTargets: 'AllowedTargetsEnforcer',
  allowedMethods: 'AllowedMethodsEnforcer',
  valueLte: 'ValueLteEnforcer',
  erc20TransferAmount: 'ERC20TransferAmountEnforcer',
  limitedCalls: 'LimitedCallsEnforcer',
  timestamp: 'TimestampEnforcer',
};

/**
 * Get enforcer addresses from the SDK environment.
 *
 * @param chainId - The chain ID.
 * @returns A mapping of CaveatType to enforcer address.
 */
export function getEnforcerAddresses(
  chainId: number,
): Record<CaveatType, Address> {
  const env = resolveEnvironment(chainId);
  const enforcers = {} as Record<CaveatType, Address>;

  for (const [caveatType, sdkKey] of Object.entries(SDK_ENFORCER_KEYS)) {
    const addr = env.caveatEnforcers[sdkKey];
    if (addr) {
      enforcers[caveatType as CaveatType] = addr;
    }
  }

  return harden(enforcers);
}

// ---------------------------------------------------------------------------
// Type mapping: our types ↔ SDK types
// ---------------------------------------------------------------------------

/**
 * Convert our Delegation type to the SDK's Delegation format.
 *
 * @param delegation - Our delegation.
 * @returns The SDK delegation.
 */
export function toSdkDelegation(delegation: Delegation): SdkDelegation {
  return {
    delegate: delegation.delegate,
    delegator: delegation.delegator,
    authority: delegation.authority,
    caveats: delegation.caveats.map((caveat) => ({
      enforcer: caveat.enforcer,
      terms: caveat.terms,
      args: '0x' as Hex,
    })),
    salt: delegation.salt,
    signature: delegation.signature ?? ('0x' as Hex),
  };
}

// ---------------------------------------------------------------------------
// Delegation operations
// ---------------------------------------------------------------------------

/**
 * Encode an array of delegations into ABI-encoded bytes.
 *
 * @param delegations - Our delegation objects.
 * @returns ABI-encoded hex string.
 */
export function encodeSdkDelegations(delegations: Delegation[]): Hex {
  const sdkDelegations = delegations.map(toSdkDelegation);
  return sdkEncodeDelegations(sdkDelegations);
}

/**
 * Build the callData for `DelegationManager.redeemDelegations`.
 *
 * @param options - Options.
 * @param options.delegations - The delegation chain (leaf to root).
 * @param options.execution - The execution to perform.
 * @returns The encoded callData.
 */
export function buildSdkRedeemCallData(options: {
  delegations: Delegation[];
  execution: Execution;
}): Hex {
  const sdkDelegations = options.delegations.map(toSdkDelegation);
  const sdkExecution = sdkCreateExecution({
    target: options.execution.target,
    value: BigInt(options.execution.value),
    callData: options.execution.callData,
  });

  const callData = contracts.DelegationManager.encode.redeemDelegations({
    delegations: [sdkDelegations],
    modes: [ExecutionMode.SingleDefault],
    executions: [[sdkExecution]],
  });

  return callData;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Create an SDK execution struct.
 *
 * @param options - Execution options.
 * @param options.target - The target contract address.
 * @param options.value - The native token amount in wei.
 * @param options.callData - The encoded function data.
 * @returns The SDK execution struct.
 */
export function createSdkExecution(options: {
  target: Address;
  value?: bigint;
  callData?: Hex;
}): { target: Address; value: bigint; callData: Hex } {
  const execution = sdkCreateExecution({
    target: options.target,
    value: options.value ?? 0n,
    callData: options.callData ?? ('0x' as Hex),
  });

  return execution as { target: Address; value: bigint; callData: Hex };
}

// ---------------------------------------------------------------------------
// Smart account
// ---------------------------------------------------------------------------

/**
 * Compute the counterfactual address for a Hybrid smart account.
 *
 * This is a pure CREATE2 computation — no network calls needed.
 *
 * @param options - Options for address derivation.
 * @param options.owner - The EOA owner address.
 * @param options.deploySalt - The deployment salt.
 * @param options.chainId - The chain ID (for environment resolution).
 * @returns The counterfactual address and factory data.
 */
export async function computeSmartAccountAddress(options: {
  owner: Address;
  deploySalt: Hex;
  chainId: number;
}): Promise<{ address: Address; factoryData: Hex }> {
  const env = resolveEnvironment(options.chainId);
  const deployParams: [Hex, string[], bigint[], bigint[]] = [
    options.owner,
    [],
    [],
    [],
  ];

  const result = await getCounterfactualAccountData({
    factory: env.SimpleFactory,
    implementations: env.implementations,
    implementation: Implementation.Hybrid,
    deployParams,
    deploySalt: options.deploySalt,
  });

  return {
    address: result.address,
    factoryData: result.factoryData,
  };
}
