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

/**
 * The default DelegationManager verifying contract address.
 * This is a placeholder; actual address depends on deployment.
 */
export const DEFAULT_DELEGATION_MANAGER: Address =
  '0x0000000000000000000000000000000000000000';

/**
 * Well-known enforcer contract addresses on supported chains.
 * These are the MetaMask Delegation Framework deployer-deterministic addresses.
 *
 * For MVP these are placeholder addresses that will be replaced with actual
 * deployments per chain.
 */
export const ENFORCER_ADDRESSES: Record<CaveatType, Address> = {
  allowedTargets: '0x0000000000000000000000000000000000000001' as Address,
  allowedMethods: '0x0000000000000000000000000000000000000002' as Address,
  valueLte: '0x0000000000000000000000000000000000000003' as Address,
  erc20TransferAmount: '0x0000000000000000000000000000000000000004' as Address,
  limitedCalls: '0x0000000000000000000000000000000000000005' as Address,
  timestamp: '0x0000000000000000000000000000000000000006' as Address,
};

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
