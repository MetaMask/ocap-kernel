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
import { toPackedUserOperation } from 'viem/account-abstraction';

import type {
  Address,
  CaveatType,
  Delegation,
  Execution,
  Hex,
} from '../types.ts';

/**
 * EIP-712 type definitions for PackedUserOperation signing.
 * Used by HybridDeleGator's validateUserOp.
 */
const SIGNABLE_USER_OP_TYPED_DATA = {
  PackedUserOperation: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' },
    { name: 'entryPoint', type: 'address' },
  ],
} as const;

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
  nativeTokenTransferAmount: 'NativeTokenTransferAmountEnforcer',
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
 * @param options.chainId - The chain ID (for DelegationManager address resolution).
 * @returns The encoded callData.
 */
export function buildSdkRedeemCallData(options: {
  delegations: Delegation[];
  execution: Execution;
  chainId: number;
}): Hex {
  const sdkDelegations = options.delegations.map(toSdkDelegation);
  const sdkExecution = sdkCreateExecution({
    target: options.execution.target,
    value: BigInt(options.execution.value),
    callData: options.execution.callData,
  });

  // Build the redeemDelegations callData for the DelegationManager
  const redeemCallData = contracts.DelegationManager.encode.redeemDelegations({
    delegations: [sdkDelegations],
    modes: [ExecutionMode.SingleDefault],
    executions: [[sdkExecution]],
  });

  // Wrap in a DeleGatorCore.execute call so the smart account routes
  // the call to the DelegationManager. The UserOp callData must target
  // the smart account's own execute function, not the DelegationManager
  // directly.
  const env = getSmartAccountsEnvironment(options.chainId);
  return contracts.DeleGatorCore.encode.execute({
    execution: sdkCreateExecution({
      target: env.DelegationManager,
      value: 0n,
      callData: redeemCallData,
    }),
  });
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

// ---------------------------------------------------------------------------
// EIP-7702 status check
// ---------------------------------------------------------------------------

/**
 * Check whether on-chain code indicates an active EIP-7702 delegation
 * to the expected Stateless7702 DeleGator implementation.
 *
 * EIP-7702 designator format: `0xef0100` + 20-byte address.
 *
 * @param code - The result of `eth_getCode` for the EOA.
 * @param chainId - The chain ID (for environment resolution).
 * @returns `true` if the code points at the expected 7702 implementation.
 */
export function isEip7702Delegated(code: string, chainId: number): boolean {
  // 0xef0100 (6 chars) + 40 hex chars address = 46 chars + "0x" prefix = 48
  if (!code || code === '0x' || code.length !== 48) {
    return false;
  }
  if (!code.toLowerCase().startsWith('0xef0100')) {
    return false;
  }
  const addr = `0x${code.slice(8)}`;
  const env = resolveEnvironment(chainId);
  const expectedImpl = (
    env.implementations as Record<string, string | undefined>
  ).EIP7702StatelessDeleGatorImpl;
  if (!expectedImpl) {
    return false;
  }
  return addr.toLowerCase() === expectedImpl.toLowerCase();
}

// ---------------------------------------------------------------------------
// UserOp signing (EIP-712 typed data for HybridDeleGator)
// ---------------------------------------------------------------------------

/**
 * Prepare EIP-712 typed data for signing a UserOperation.
 *
 * HybridDeleGator smart accounts validate UserOp signatures as EIP-712
 * typed data (not raw ECDSA over the standard UserOp hash). This function
 * produces the typed data payload that the EOA owner must sign.
 *
 * @param options - Options.
 * @param options.userOp - The UserOperation to sign.
 * @param options.entryPoint - The EntryPoint address.
 * @param options.chainId - The chain ID.
 * @param options.smartAccountAddress - The smart account address (verifyingContract).
 * @param options.smartAccountName - The smart account name for the EIP-712 domain.
 * @returns The EIP-712 typed data for signing.
 */
export function prepareUserOpTypedData(options: {
  userOp: Record<string, unknown>;
  entryPoint: Address;
  chainId: number;
  smartAccountAddress: Address;
  smartAccountName?: string;
}): Eip712TypedData {
  const packed = toPackedUserOperation({
    ...options.userOp,
    signature: '0x',
  } as never);

  return {
    domain: {
      chainId: options.chainId,
      name: options.smartAccountName ?? 'HybridDeleGator',
      version: '1',
      verifyingContract: options.smartAccountAddress,
    },
    types: SIGNABLE_USER_OP_TYPED_DATA as Record<
      string,
      { name: string; type: string }[]
    >,
    primaryType: 'PackedUserOperation',
    message: {
      ...packed,
      entryPoint: options.entryPoint,
    },
  };
}
