// Public API exports for @ocap/eth-wallet

// Constants
export {
  CHAIN_CONTRACTS,
  DEFAULT_DELEGATION_MANAGER,
  DELEGATION_TYPES,
  ENFORCER_ADDRESSES,
  ETH_HD_PATH_PREFIX,
  PLACEHOLDER_CONTRACTS,
  ROOT_AUTHORITY,
  getChainContracts,
} from './constants.ts';
export type { ChainContracts } from './constants.ts';

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
  Execution,
  Hex,
  SigningRequest,
  TransactionRequest,
  UserOperation,
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
  ExecutionStruct,
  SigningRequestStruct,
  TransactionRequestStruct,
  UserOperationStruct,
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

// UserOperation utilities
export {
  buildDelegationUserOp,
  buildRedeemCallData,
  computeUserOpHash,
  encodeDelegationChain,
  encodeExecution,
  ENTRY_POINT_V07,
} from './lib/userop.ts';

// Bundler utilities
export {
  estimateUserOpGas,
  getUserOpReceipt,
  submitUserOp,
  waitForUserOp,
} from './lib/bundler.ts';
export type {
  BundlerConfig,
  UserOpGasEstimate,
  UserOpReceipt,
} from './lib/bundler.ts';

// MetaMask signing adapter
export {
  makeProviderSigner,
  connectMetaMaskSigner,
} from './lib/metamask-signer.ts';
export type {
  EthereumProvider,
  MetaMaskSigner,
  MetaMaskSignerOptions,
} from './lib/metamask-signer.ts';
