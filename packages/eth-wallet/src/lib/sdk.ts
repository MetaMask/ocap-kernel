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
  toMetaMaskSmartAccount,
  contracts,
} from '@metamask/smart-accounts-kit';
import type {
  SmartAccountsEnvironment,
  Delegation as SdkDelegation,
  ToMetaMaskSmartAccountReturnType,
} from '@metamask/smart-accounts-kit';
import {
  encodeDelegations as sdkEncodeDelegations,
  getCounterfactualAccountData,
} from '@metamask/smart-accounts-kit/utils';
import { keccak256, encodePacked } from 'viem';
import type { PublicClient, Account as ViemAccount } from 'viem';

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

/**
 * Convert an SDK Delegation back to our Delegation type.
 *
 * @param sdkDelegation - The SDK delegation.
 * @param chainId - The chain ID.
 * @param status - The delegation status (defaults to 'pending').
 * @returns Our delegation type.
 */
export function fromSdkDelegation(
  sdkDelegation: SdkDelegation,
  chainId: number,
  status: 'pending' | 'signed' | 'revoked' = 'pending',
): Delegation {
  const id = keccak256(
    encodePacked(
      ['address', 'address', 'bytes32', 'uint256'],
      [
        sdkDelegation.delegator,
        sdkDelegation.delegate,
        sdkDelegation.authority,
        BigInt(sdkDelegation.salt),
      ],
    ),
  );

  return harden({
    id,
    delegator: sdkDelegation.delegator,
    delegate: sdkDelegation.delegate,
    authority: sdkDelegation.authority,
    caveats: sdkDelegation.caveats.map((caveat) => ({
      enforcer: caveat.enforcer,
      terms: caveat.terms,
      type: resolveCaveatType(caveat.enforcer, chainId),
    })),
    salt: sdkDelegation.salt,
    signature:
      sdkDelegation.signature === '0x' ? undefined : sdkDelegation.signature,
    chainId,
    status,
  });
}

/**
 * Attempt to resolve the CaveatType from an enforcer address.
 * Falls back to 'allowedTargets' if the enforcer is not recognized.
 *
 * @param enforcer - The enforcer contract address.
 * @param chainId - The chain ID.
 * @returns The resolved caveat type.
 */
function resolveCaveatType(enforcer: Address, chainId: number): CaveatType {
  try {
    const env = resolveEnvironment(chainId);
    for (const [caveatType, sdkKey] of Object.entries(SDK_ENFORCER_KEYS)) {
      if (
        env.caveatEnforcers[sdkKey] &&
        (env.caveatEnforcers[sdkKey] as string).toLowerCase() ===
          enforcer.toLowerCase()
      ) {
        return caveatType as CaveatType;
      }
    }
  } catch {
    // SDK doesn't know this chain — can't resolve
  }
  return 'allowedTargets';
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

/**
 * Create a Hybrid smart account via the SDK.
 *
 * @param options - Smart account options.
 * @param options.client - The viem public client.
 * @param options.signer - The signer configuration.
 * @param options.signer.account - The account with signing methods.
 * @param options.environment - Optional SDK environment override.
 * @param options.deployParams - Deployment parameters for counterfactual accounts.
 * @param options.deploySalt - Deployment salt for deterministic addresses.
 * @param options.address - Existing smart account address.
 * @returns The smart account instance.
 */
export async function createHybridSmartAccount(options: {
  client: PublicClient;
  signer: {
    account: Pick<ViemAccount, 'signMessage' | 'signTypedData' | 'address'>;
  };
  environment?: SmartAccountsEnvironment;
  deployParams?: [Hex, string[], bigint[], bigint[]];
  deploySalt?: Hex;
  address?: Address;
}): Promise<ToMetaMaskSmartAccountReturnType<Implementation.Hybrid>> {
  const params = {
    client: options.client,
    implementation: Implementation.Hybrid,
    signer: options.signer,
    environment: options.environment,
  } as Parameters<typeof toMetaMaskSmartAccount<Implementation.Hybrid>>[0];

  if (options.address) {
    (params as Record<string, unknown>).address = options.address;
  } else if (options.deployParams && options.deploySalt) {
    (params as Record<string, unknown>).deployParams = options.deployParams;
    (params as Record<string, unknown>).deploySalt = options.deploySalt;
  }

  return toMetaMaskSmartAccount(params);
}
