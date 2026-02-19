// Public API exports for @ocap/eth-wallet

// Constants
export {
  CHAIN_CONTRACTS,
  DEFAULT_DELEGATION_MANAGER,
  DELEGATION_TYPES,
  ENFORCER_ADDRESSES,
  ETH_HD_PATH_PREFIX,
  PIMLICO_RPC_BASE_URL,
  PLACEHOLDER_CONTRACTS,
  ROOT_AUTHORITY,
  SEPOLIA_CHAIN_ID,
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
  DelegationMatchResult,
  DelegationStatus,
  Eip712Domain,
  Eip712TypedData,
  Execution,
  Hex,
  SigningRequest,
  SmartAccountConfig,
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
  makeChainConfig,
  SigningRequestStruct,
  SmartAccountConfigStruct,
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
  explainDelegationMatch,
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
  numberToHex,
  ENTRY_POINT_V07,
} from './lib/userop.ts';

// Bundler utilities (deprecated — use bundler-client.ts)
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

// Bundler client (viem-based replacement)
export { makeBundlerClient } from './lib/bundler-client.ts';
export type {
  BundlerClientConfig,
  ViemBundlerClient,
} from './lib/bundler-client.ts';

// SDK adapter
export {
  resolveEnvironment,
  getDelegationManagerAddress,
  getEnforcerAddresses,
  toSdkDelegation,
  fromSdkDelegation,
  encodeSdkDelegations,
  buildSdkRedeemCallData,
  createSdkExecution,
  computeSmartAccountAddress,
  createHybridSmartAccount,
  Implementation,
  ExecutionMode,
} from './lib/sdk.ts';
export type { SmartAccountsEnvironment, SdkDelegation } from './lib/sdk.ts';

// Keyring utilities
export { generateMnemonicPhrase } from './lib/keyring.ts';

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
