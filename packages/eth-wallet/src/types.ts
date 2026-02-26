import {
  array,
  boolean,
  create,
  define,
  enums,
  literal,
  number,
  object,
  optional,
  record,
  string,
  union,
  unknown,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';

// ---------------------------------------------------------------------------
// Hex string helpers
// ---------------------------------------------------------------------------

/**
 * A 0x-prefixed hex string.
 */
export type Hex = `0x${string}`;

const HexStruct = define<Hex>('Hex', (value) => {
  return typeof value === 'string' && /^0x[\da-f]*$/iu.test(value);
});

/**
 * A 0x-prefixed Ethereum address (20 bytes).
 */
export type Address = Hex;

const AddressStruct = define<Address>('Address', (value) => {
  return typeof value === 'string' && /^0x[\da-f]{40}$/iu.test(value);
});

// ---------------------------------------------------------------------------
// Chain configuration
// ---------------------------------------------------------------------------

export const ChainConfigStruct = object({
  chainId: number(),
  rpcUrl: string(),
  name: optional(string()),
});

export type ChainConfig = Infer<typeof ChainConfigStruct>;

/**
 * Create a validated ChainConfig.
 *
 * @param options - Chain configuration options.
 * @param options.chainId - The numeric chain ID.
 * @param options.rpcUrl - The JSON-RPC endpoint URL.
 * @param options.name - Optional human-readable chain name.
 * @returns A validated ChainConfig object.
 */
export function makeChainConfig(options: {
  chainId: number;
  rpcUrl: string;
  name?: string;
}): ChainConfig {
  return create(options, ChainConfigStruct);
}

// ---------------------------------------------------------------------------
// Caveat types (MetaMask Delegation Framework / Gator)
// ---------------------------------------------------------------------------

/**
 * Supported caveat enforcer types.
 * Each maps to a deployed enforcer contract on the delegation framework.
 */
export const CaveatTypeValues = [
  'allowedTargets',
  'allowedMethods',
  'valueLte',
  'nativeTokenTransferAmount',
  'erc20TransferAmount',
  'limitedCalls',
  'timestamp',
] as const;

export type CaveatType = (typeof CaveatTypeValues)[number];

const CaveatTypeStruct = enums(CaveatTypeValues);

export const CaveatStruct = object({
  enforcer: AddressStruct,
  terms: HexStruct,
  args: optional(HexStruct),
  type: CaveatTypeStruct,
});

export type Caveat = Infer<typeof CaveatStruct>;

// ---------------------------------------------------------------------------
// Delegation
// ---------------------------------------------------------------------------

export const DelegationStatusValues = ['pending', 'signed', 'revoked'] as const;

export type DelegationStatus = (typeof DelegationStatusValues)[number];

export const DelegationStruct = object({
  id: string(),
  delegator: AddressStruct,
  delegate: AddressStruct,
  authority: HexStruct,
  caveats: array(CaveatStruct),
  salt: HexStruct,
  signature: optional(HexStruct),
  chainId: number(),
  status: enums(DelegationStatusValues),
});

export type Delegation = Infer<typeof DelegationStruct>;

// ---------------------------------------------------------------------------
// Signing request (used for peer wallet communication)
// ---------------------------------------------------------------------------

export const SigningRequestStruct = union([
  object({
    type: literal('transaction'),
    tx: object({
      from: AddressStruct,
      to: AddressStruct,
      value: optional(HexStruct),
      data: optional(HexStruct),
      nonce: optional(number()),
      gasLimit: optional(HexStruct),
      gasPrice: optional(HexStruct),
      maxFeePerGas: optional(HexStruct),
      maxPriorityFeePerGas: optional(HexStruct),
      chainId: optional(number()),
    }),
  }),
  object({
    type: literal('typedData'),
    data: record(string(), unknown()),
  }),
  object({
    type: literal('message'),
    message: string(),
    account: AddressStruct,
  }),
]);

export type SigningRequest = Infer<typeof SigningRequestStruct>;

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

export const TransactionRequestStruct = object({
  from: AddressStruct,
  to: AddressStruct,
  value: optional(HexStruct),
  data: optional(HexStruct),
  nonce: optional(number()),
  gasLimit: optional(HexStruct),
  gasPrice: optional(HexStruct),
  maxFeePerGas: optional(HexStruct),
  maxPriorityFeePerGas: optional(HexStruct),
  chainId: optional(number()),
});

export type TransactionRequest = Infer<typeof TransactionRequestStruct> & {
  /**
   * EIP-7702 signed authorization list. When present, the transaction is
   * serialized as a type-4 (EIP-7702) transaction instead of EIP-1559.
   * This field is not validated by the struct since it only flows internally.
   */
  authorizationList?: readonly unknown[];
};

// ---------------------------------------------------------------------------
// Wallet capabilities introspection
// ---------------------------------------------------------------------------

export const WalletCapabilitiesStruct = object({
  hasLocalKeys: boolean(),
  localAccounts: array(AddressStruct),
  delegationCount: number(),
  hasPeerWallet: boolean(),
  hasExternalSigner: boolean(),
  hasBundlerConfig: boolean(),
  smartAccountAddress: optional(AddressStruct),
});

export type WalletCapabilities = Infer<typeof WalletCapabilitiesStruct>;

// ---------------------------------------------------------------------------
// Smart account configuration
// ---------------------------------------------------------------------------

export const SmartAccountConfigStruct = object({
  implementation: union([literal('hybrid'), literal('stateless7702')]),
  deploySalt: optional(HexStruct),
  address: optional(AddressStruct),
  factory: optional(AddressStruct),
  factoryData: optional(HexStruct),
  deployed: optional(boolean()),
});

export type SmartAccountConfig = Infer<typeof SmartAccountConfigStruct>;

// ---------------------------------------------------------------------------
// Action descriptor (for delegation matching)
// ---------------------------------------------------------------------------

export const ActionStruct = object({
  to: AddressStruct,
  value: optional(HexStruct),
  data: optional(HexStruct),
});

export type Action = Infer<typeof ActionStruct>;

// ---------------------------------------------------------------------------
// Delegation creation options
// ---------------------------------------------------------------------------

export const CreateDelegationOptionsStruct = object({
  delegate: AddressStruct,
  caveats: array(CaveatStruct),
  chainId: number(),
  salt: optional(HexStruct),
});

export type CreateDelegationOptions = Infer<
  typeof CreateDelegationOptionsStruct
>;

// ---------------------------------------------------------------------------
// EIP-712 typed data (generic representation)
// ---------------------------------------------------------------------------

export const Eip712DomainStruct = object({
  name: optional(string()),
  version: optional(string()),
  chainId: optional(number()),
  verifyingContract: optional(AddressStruct),
  salt: optional(HexStruct),
});

export type Eip712Domain = Infer<typeof Eip712DomainStruct>;

export const Eip712TypedDataStruct = object({
  domain: Eip712DomainStruct,
  types: record(string(), array(object({ name: string(), type: string() }))),
  primaryType: string(),
  message: record(string(), unknown()),
});

export type Eip712TypedData = Infer<typeof Eip712TypedDataStruct>;

// ---------------------------------------------------------------------------
// ERC-4337 UserOperation (off-chain representation, v0.7)
// ---------------------------------------------------------------------------

export const UserOperationStruct = object({
  sender: AddressStruct,
  nonce: HexStruct,
  factory: optional(AddressStruct),
  factoryData: optional(HexStruct),
  callData: HexStruct,
  callGasLimit: HexStruct,
  verificationGasLimit: HexStruct,
  preVerificationGas: HexStruct,
  maxFeePerGas: HexStruct,
  maxPriorityFeePerGas: HexStruct,
  paymaster: optional(AddressStruct),
  paymasterVerificationGasLimit: optional(HexStruct),
  paymasterPostOpGasLimit: optional(HexStruct),
  paymasterData: optional(HexStruct),
  signature: HexStruct,
});

export type UserOperation = Infer<typeof UserOperationStruct>;

// ---------------------------------------------------------------------------
// Execution descriptor (for delegation redemption)
// ---------------------------------------------------------------------------

export const ExecutionStruct = object({
  target: AddressStruct,
  value: HexStruct,
  callData: HexStruct,
});

export type Execution = Infer<typeof ExecutionStruct>;

// ---------------------------------------------------------------------------
// Delegation match result (for delegation matching diagnostics)
// ---------------------------------------------------------------------------

export type DelegationMatchResult = {
  matches: boolean;
  failedCaveat?: CaveatType;
  reason?: string;
};
