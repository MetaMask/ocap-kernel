// Public API exports for @ocap/evm-wallet-experiment

// Constants
export {
  CHAIN_CONTRACTS,
  CHAIN_NAMES,
  DEFAULT_DELEGATION_MANAGER,
  DELEGATION_TYPES,
  ENFORCER_ADDRESSES,
  ETH_HD_PATH_PREFIX,
  PIMLICO_RPC_BASE_URL,
  PLACEHOLDER_CONTRACTS,
  ROOT_AUTHORITY,
  SEPOLIA_CHAIN_ID,
  SUPPORTED_CHAIN_IDS,
  getChainContracts,
  getPimlicoRpcUrl,
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
  DelegationGrant,
  DelegationMatchResult,
  DelegationStatus,
  Eip712Domain,
  Eip712TypedData,
  Execution,
  Hex,
  SigningRequest,
  SmartAccountConfig,
  SwapQuote,
  SwapResult,
  TransactionRequest,
  TransferFungibleGrant,
  TransferNativeGrant,
  UserOperation,
  WalletCapabilities,
} from './types.ts';

export {
  ActionStruct,
  CaveatStruct,
  CaveatTypeValues,
  ChainConfigStruct,
  CreateDelegationOptionsStruct,
  DelegationGrantStruct,
  DelegationStatusValues,
  DelegationStruct,
  Eip712DomainStruct,
  Eip712TypedDataStruct,
  ExecutionStruct,
  makeChainConfig,
  SigningRequestStruct,
  SmartAccountConfigStruct,
  SwapQuoteStruct,
  TransactionRequestStruct,
  TransferFungibleGrantStruct,
  TransferNativeGrantStruct,
  UserOperationStruct,
  WalletCapabilitiesStruct,
} from './types.ts';

// Caveat utilities (for creating delegations externally)
export {
  encodeAllowedTargets,
  encodeAllowedCalldata,
  encodeAllowedMethods,
  encodeValueLte,
  encodeNativeTokenTransferAmount,
  encodeErc20TransferAmount,
  encodeLimitedCalls,
  encodeTimestamp,
  makeCaveat,
  getEnforcerAddress,
} from './lib/caveats.ts';

// ERC-20 utilities
export {
  encodeTransfer,
  encodeApprove,
  encodeAllowance,
  encodeBalanceOf,
  makeErc20TransferExecution,
  decodeTransferCalldata,
  decodeAllowanceResult,
  isErc20TransferCalldata,
  ERC20_TRANSFER_SELECTOR,
  ERC20_APPROVE_SELECTOR,
  ERC20_ALLOWANCE_SELECTOR,
} from './lib/erc20.ts';

// Delegation utilities
export {
  makeDelegation,
  prepareDelegationTypedData,
  delegationMatchesAction,
  explainDelegationMatch,
  finalizeDelegation,
  computeDelegationId,
  generateSalt,
  makeSaltGenerator,
} from './lib/delegation.ts';
export type { SaltGenerator } from './lib/delegation.ts';

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
  PaymasterSponsorResult,
  UserOpReceiptResult,
  ViemBundlerClient,
} from './lib/bundler-client.ts';

// SDK adapter
export {
  registerEnvironment,
  resolveEnvironment,
  getDelegationManagerAddress,
  getEnforcerAddresses,
  toSdkDelegation,
  encodeSdkDelegations,
  buildBatchExecuteCallData,
  buildSdkBatchRedeemCallData,
  buildSdkDisableCallData,
  buildSdkRedeemCallData,
  createSdkExecution,
  computeSmartAccountAddress,
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

// Method catalog
export { METHOD_CATALOG } from './lib/method-catalog.ts';
export type { CatalogMethodName } from './lib/method-catalog.ts';

// Twin factory
export { makeDelegationTwin } from './lib/delegation-twin.ts';
