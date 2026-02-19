import {
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  keccak256,
  toHex,
} from 'viem';

import type {
  Address,
  Delegation,
  Execution,
  Hex,
  UserOperation,
} from '../types.ts';

/**
 * ERC-4337 EntryPoint v0.7 address (deployed at deterministic address).
 */
export const ENTRY_POINT_V07: Address =
  '0x0000000071727de22e5e9d8baf0edac6f37da032';

/**
 * Default gas limits for UserOperations.
 * These are conservative defaults; use `estimateUserOpGas` for accurate values.
 */
const DEFAULT_GAS_LIMITS = {
  callGasLimit: '0x50000' as Hex,
  verificationGasLimit: '0x60000' as Hex,
  preVerificationGas: '0x10000' as Hex,
} as const;

/**
 * ABI tuple type for a single Delegation struct.
 */
const DELEGATION_TUPLE =
  '(address delegate, address delegator, bytes32 authority, (address enforcer, bytes terms)[] caveats, uint256 salt, bytes signature)';

/**
 * Encode a delegation chain into the permission context bytes
 * expected by `DelegationManager.redeemDelegations`.
 *
 * @param delegations - The delegation chain (leaf to root order).
 * @returns The ABI-encoded permission context.
 */
export function encodeDelegationChain(delegations: Delegation[]): Hex {
  const tuples = delegations.map((del) => ({
    delegate: del.delegate,
    delegator: del.delegator,
    authority: del.authority,
    caveats: del.caveats.map((cav) => ({
      enforcer: cav.enforcer,
      terms: cav.terms,
    })),
    salt: BigInt(del.salt),
    signature: del.signature ?? '0x',
  }));

  return encodeAbiParameters(parseAbiParameters(`${DELEGATION_TUPLE}[]`), [
    tuples,
  ] as never);
}

/**
 * Encode an Execution struct for use in callData.
 *
 * @param execution - The execution to encode.
 * @returns The ABI-encoded execution.
 */
export function encodeExecution(execution: Execution): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address target, uint256 value, bytes callData'),
    [execution.target, BigInt(execution.value), execution.callData],
  );
}

/**
 * Function selector for `redeemDelegations(bytes[],uint256[],bytes[])`.
 */
const REDEEM_DELEGATIONS_SELECTOR = '0x38c86720' as Hex;

/**
 * Build the callData for `DelegationManager.redeemDelegations`.
 *
 * @param options - Options.
 * @param options.delegations - The delegation chain (leaf to root).
 * @param options.execution - The execution to perform.
 * @returns The encoded callData.
 */
export function buildRedeemCallData(options: {
  delegations: Delegation[];
  execution: Execution;
}): Hex {
  const permissionContexts = [encodeDelegationChain(options.delegations)];
  const modes = [0n]; // SingleDefault
  const executions = [
    encodeAbiParameters(
      parseAbiParameters('(address target, uint256 value, bytes callData)[]'),
      [
        [
          {
            target: options.execution.target,
            value: BigInt(options.execution.value),
            callData: options.execution.callData,
          },
        ],
      ] as never,
    ),
  ];

  const args = encodeAbiParameters(
    parseAbiParameters('bytes[], uint256[], bytes[]'),
    [permissionContexts, modes, executions],
  );

  return (REDEEM_DELEGATIONS_SELECTOR + args.slice(2)) as Hex;
}

/**
 * Build an unsigned UserOperation for delegation redemption.
 *
 * @param options - Options.
 * @param options.sender - The smart account address.
 * @param options.nonce - The account nonce.
 * @param options.delegations - The delegation chain.
 * @param options.execution - The execution to perform.
 * @param options.maxFeePerGas - Max fee per gas.
 * @param options.maxPriorityFeePerGas - Max priority fee per gas.
 * @param options.gasLimits - Optional gas limit overrides.
 * @param options.gasLimits.callGasLimit - Override for call gas limit.
 * @param options.gasLimits.verificationGasLimit - Override for verification gas limit.
 * @param options.gasLimits.preVerificationGas - Override for pre-verification gas.
 * @param options.factory - Optional factory address for account deployment.
 * @param options.factoryData - Optional factory data for account deployment.
 * @returns An unsigned UserOperation.
 */
export function buildDelegationUserOp(options: {
  sender: Address;
  nonce: Hex;
  delegations: Delegation[];
  execution: Execution;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  factory?: Address;
  factoryData?: Hex;
  gasLimits?: {
    callGasLimit?: Hex;
    verificationGasLimit?: Hex;
    preVerificationGas?: Hex;
  };
}): UserOperation {
  const callData = buildRedeemCallData({
    delegations: options.delegations,
    execution: options.execution,
  });

  return {
    sender: options.sender,
    nonce: options.nonce,
    ...(options.factory ? { factory: options.factory } : {}),
    ...(options.factoryData ? { factoryData: options.factoryData } : {}),
    callData,
    callGasLimit:
      options.gasLimits?.callGasLimit ?? DEFAULT_GAS_LIMITS.callGasLimit,
    verificationGasLimit:
      options.gasLimits?.verificationGasLimit ??
      DEFAULT_GAS_LIMITS.verificationGasLimit,
    preVerificationGas:
      options.gasLimits?.preVerificationGas ??
      DEFAULT_GAS_LIMITS.preVerificationGas,
    maxFeePerGas: options.maxFeePerGas,
    maxPriorityFeePerGas: options.maxPriorityFeePerGas,
    signature: '0x' as Hex,
  };
}

/**
 * Compute the hash of a UserOperation for signing (ERC-4337 v0.7).
 *
 * @param userOp - The UserOperation.
 * @param entryPoint - The EntryPoint address.
 * @param chainId - The chain ID.
 * @returns The hash to sign.
 */
export function computeUserOpHash(
  userOp: UserOperation,
  entryPoint: Address,
  chainId: number,
): Hex {
  // Pack the UserOperation fields
  const packed = keccak256(
    encodePacked(
      [
        'address',
        'uint256',
        'bytes32',
        'bytes32',
        'bytes32',
        'uint256',
        'bytes32',
        'bytes32',
      ],
      [
        userOp.sender,
        BigInt(userOp.nonce),
        keccak256(
          userOp.factory && userOp.factoryData
            ? encodePacked(
                ['address', 'bytes'],
                [userOp.factory, userOp.factoryData],
              )
            : '0x',
        ),
        keccak256(userOp.callData),
        encodePacked(
          ['uint128', 'uint128'],
          [BigInt(userOp.verificationGasLimit), BigInt(userOp.callGasLimit)],
        ),
        BigInt(userOp.preVerificationGas),
        encodePacked(
          ['uint128', 'uint128'],
          [BigInt(userOp.maxPriorityFeePerGas), BigInt(userOp.maxFeePerGas)],
        ),
        keccak256(
          userOp.paymaster
            ? encodePacked(
                ['address', 'uint128', 'uint128', 'bytes'],
                [
                  userOp.paymaster,
                  BigInt(userOp.paymasterVerificationGasLimit ?? '0x0'),
                  BigInt(userOp.paymasterPostOpGasLimit ?? '0x0'),
                  userOp.paymasterData ?? '0x',
                ],
              )
            : '0x',
        ),
      ],
    ),
  );

  return keccak256(
    encodePacked(
      ['bytes32', 'address', 'uint256'],
      [packed, entryPoint, BigInt(chainId)],
    ),
  );
}

/**
 * Convert a number to a hex string.
 *
 * @param value - The number to convert.
 * @returns The hex string.
 */
export function numberToHex(value: number | bigint): Hex {
  return toHex(value);
}
