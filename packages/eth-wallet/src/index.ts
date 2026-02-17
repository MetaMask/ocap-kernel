// Public API exports for @ocap/eth-wallet

// Constants
export {
  DEFAULT_DELEGATION_MANAGER,
  DELEGATION_TYPES,
  ENFORCER_ADDRESSES,
  ETH_HD_PATH_PREFIX,
  ROOT_AUTHORITY,
} from './constants.ts';

// Cluster configuration
export { makeWalletClusterConfig } from './cluster-config.ts';
export type { WalletClusterConfigOptions } from './cluster-config.ts';

// Types
export type {
  Address,
  Action,
  Caveat,
  CaveatType,
  ChainConfig,
  CreateDelegationOptions,
  Delegation,
  DelegationStatus,
  Eip712Domain,
  Eip712TypedData,
  Hex,
  SigningRequest,
  TransactionRequest,
  WalletCapabilities,
} from './types.ts';

export {
  ActionStruct,
  CaveatStruct,
  CaveatTypeValues,
  ChainConfigStruct,
  CreateDelegationOptionsStruct,
  DelegationStatusValues,
  DelegationStruct,
  Eip712DomainStruct,
  Eip712TypedDataStruct,
  SigningRequestStruct,
  TransactionRequestStruct,
  WalletCapabilitiesStruct,
} from './types.ts';

// Caveat utilities (for creating delegations externally)
export {
  encodeAllowedTargets,
  encodeAllowedMethods,
  encodeValueLte,
  encodeErc20TransferAmount,
  encodeLimitedCalls,
  encodeTimestamp,
  makeCaveat,
  getEnforcerAddress,
} from './lib/caveats.ts';

// Delegation utilities
export {
  makeDelegation,
  prepareDelegationTypedData,
  delegationMatchesAction,
  finalizeDelegation,
  computeDelegationId,
  generateSalt,
} from './lib/delegation.ts';
