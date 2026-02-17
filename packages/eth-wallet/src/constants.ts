import type { Address, CaveatType, Hex } from './types.ts';

/**
 * The default BIP-44 HD path for Ethereum accounts: m/44'/60'/0'/0/{index}.
 */
export const ETH_HD_PATH_PREFIX = "m/44'/60'/0'/0" as const;

/**
 * The root authority hash (no parent delegation).
 */
export const ROOT_AUTHORITY: Hex =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// ---------------------------------------------------------------------------
// Chain-specific contract addresses
// ---------------------------------------------------------------------------

/**
 * Contract addresses for a specific chain deployment.
 */
export type ChainContracts = {
  delegationManager: Address;
  enforcers: Record<CaveatType, Address>;
};

/**
 * Placeholder contract addresses used when no chain-specific deployment
 * is registered. These will not work on-chain but allow offline testing.
 */
export const PLACEHOLDER_CONTRACTS: ChainContracts = {
  delegationManager: '0x0000000000000000000000000000000000000000' as Address,
  enforcers: {
    allowedTargets: '0x0000000000000000000000000000000000000001' as Address,
    allowedMethods: '0x0000000000000000000000000000000000000002' as Address,
    valueLte: '0x0000000000000000000000000000000000000003' as Address,
    erc20TransferAmount:
      '0x0000000000000000000000000000000000000004' as Address,
    limitedCalls: '0x0000000000000000000000000000000000000005' as Address,
    timestamp: '0x0000000000000000000000000000000000000006' as Address,
  },
};

/**
 * Registry of contract addresses keyed by chain ID.
 * Populate with actual deployment addresses per chain.
 */
export const CHAIN_CONTRACTS: Record<number, ChainContracts> = {};

/**
 * Get the contract addresses for a chain, falling back to placeholders.
 *
 * @param chainId - The chain ID to look up.
 * @returns The contract addresses.
 */
export function getChainContracts(chainId?: number): ChainContracts {
  if (chainId !== undefined && CHAIN_CONTRACTS[chainId]) {
    return CHAIN_CONTRACTS[chainId];
  }
  return PLACEHOLDER_CONTRACTS;
}

// ---------------------------------------------------------------------------
// Legacy exports (point to placeholders)
// ---------------------------------------------------------------------------

/**
 * The default DelegationManager verifying contract address.
 *
 * @deprecated Use `getChainContracts(chainId).delegationManager` instead.
 */
export const DEFAULT_DELEGATION_MANAGER: Address =
  PLACEHOLDER_CONTRACTS.delegationManager;

/**
 * Well-known enforcer contract addresses.
 *
 * @deprecated Use `getChainContracts(chainId).enforcers` instead.
 */
export const ENFORCER_ADDRESSES: Record<CaveatType, Address> =
  PLACEHOLDER_CONTRACTS.enforcers;

/**
 * EIP-712 type definitions for the Delegation Framework.
 */
export const DELEGATION_TYPES: Record<
  string,
  { name: string; type: string }[]
> = {
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
};
