import type { Address, CaveatType, Hex } from './types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * The Sepolia testnet chain ID.
 */
export const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Base URL for the Pimlico bundler on Sepolia.
 *
 * @deprecated Use {@link getPimlicoRpcUrl} for chain-specific URLs.
 */
export const PIMLICO_RPC_BASE_URL = 'https://api.pimlico.io/v2/sepolia/rpc';

/**
 * Pimlico chain slug per chain ID.
 */
const PIMLICO_CHAIN_SLUGS: Record<number, string> = harden({
  1: 'ethereum',
  10: 'optimism',
  56: 'binance',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  59144: 'linea',
  11155111: 'sepolia',
});

/**
 * Get the Pimlico bundler RPC URL for a given chain.
 *
 * @param chainId - The chain ID.
 * @returns The Pimlico bundler RPC URL.
 */
export function getPimlicoRpcUrl(chainId: number): string {
  const slug = PIMLICO_CHAIN_SLUGS[chainId];
  if (slug === undefined) {
    throw new Error(
      `No Pimlico bundler URL for chain ${chainId}. ` +
        `Supported chains: ${Object.keys(PIMLICO_CHAIN_SLUGS).join(', ')}.`,
    );
  }
  return `https://api.pimlico.io/v2/${slug}/rpc`;
}

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
export const PLACEHOLDER_CONTRACTS: ChainContracts = harden({
  delegationManager: '0x0000000000000000000000000000000000000000' as Address,
  enforcers: {
    allowedTargets: '0x0000000000000000000000000000000000000001' as Address,
    allowedMethods: '0x0000000000000000000000000000000000000002' as Address,
    allowedCalldata: '0x0000000000000000000000000000000000000008' as Address,
    valueLte: '0x0000000000000000000000000000000000000003' as Address,
    nativeTokenTransferAmount:
      '0x0000000000000000000000000000000000000007' as Address,
    erc20TransferAmount:
      '0x0000000000000000000000000000000000000004' as Address,
    limitedCalls: '0x0000000000000000000000000000000000000005' as Address,
    timestamp: '0x0000000000000000000000000000000000000006' as Address,
  },
});

// ---------------------------------------------------------------------------
// Shared contract addresses (same across all supported chains)
// ---------------------------------------------------------------------------

const SHARED_DELEGATION_MANAGER: Address =
  '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as Address;

/**
 * Enforcer addresses shared across all supported chains (same CREATE2
 * addresses on every chain, including Sepolia).
 */
const SHARED_ENFORCERS: Record<CaveatType, Address> = harden({
  allowedTargets: '0x7F20f61b1f09b08D970938F6fa563634d65c4EeB' as Address,
  allowedMethods: '0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5' as Address,
  allowedCalldata: '0xc2b0d624c1c4319760c96503ba27c347f3260f55' as Address,
  valueLte: '0x92Bf12322527cAA612fd31a0e810472BBB106A8F' as Address,
  nativeTokenTransferAmount:
    '0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320' as Address,
  erc20TransferAmount: '0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc' as Address,
  limitedCalls: '0x04658B29F6b82ed55274221a06Fc97D318E25416' as Address,
  timestamp: '0x1046bb45C8d673d4ea75321280DB34899413c069' as Address,
});

const makeChainContracts = (): ChainContracts =>
  harden({
    delegationManager: SHARED_DELEGATION_MANAGER,
    enforcers: { ...SHARED_ENFORCERS },
  });

/**
 * Supported chain IDs (both mainnets and testnets).
 */
export const SUPPORTED_CHAIN_IDS: readonly number[] = harden([
  1, 10, 56, 137, 8453, 42161, 59144, 11155111,
]);

/**
 * Human-readable chain names keyed by chain ID.
 */
export const CHAIN_NAMES: Record<number, string> = harden({
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum One',
  59144: 'Linea',
  11155111: 'Sepolia',
});

/**
 * Registry of contract addresses keyed by chain ID.
 */
export const CHAIN_CONTRACTS: Readonly<Record<number, ChainContracts>> = harden(
  {
    /** Ethereum mainnet (chain 1). */
    1: makeChainContracts(),
    /** Optimism (chain 10). */
    10: makeChainContracts(),
    /** BNB Smart Chain (chain 56). */
    56: makeChainContracts(),
    /** Polygon (chain 137). */
    137: makeChainContracts(),
    /** Base (chain 8453). */
    8453: makeChainContracts(),
    /** Arbitrum One (chain 42161). */
    42161: makeChainContracts(),
    /** Linea (chain 59144). */
    59144: makeChainContracts(),
    /** Sepolia testnet (chain 11155111). */
    [SEPOLIA_CHAIN_ID]: makeChainContracts(),
  },
);

/**
 * Get the contract addresses for a chain, falling back to placeholders.
 *
 * @param chainId - The chain ID to look up.
 * @returns The contract addresses.
 */
export function getChainContracts(chainId?: number): ChainContracts {
  if (chainId !== undefined) {
    const entry = CHAIN_CONTRACTS[chainId];
    if (entry !== undefined) {
      return entry;
    }
  }
  if (chainId !== undefined) {
    throw new Error(
      `No contract addresses registered for chain ${chainId}. ` +
        `Register addresses in CHAIN_CONTRACTS or provide explicit enforcer addresses.`,
    );
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
> = harden({
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
});
