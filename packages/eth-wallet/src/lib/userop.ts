import {
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  keccak256,
  toHex,
} from 'viem';

import {
  encodeSdkDelegations,
  buildSdkRedeemCallData,
  createSdkExecution,
} from './sdk.ts';
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
 * Encode a delegation chain into the permission context bytes
 * expected by `DelegationManager.redeemDelegations`.
 *
 * Delegates to the SDK's `encodeDelegations()`.
 *
 * @param delegations - The delegation chain (leaf to root order).
 * @returns The ABI-encoded permission context.
 */
export function encodeDelegationChain(delegations: Delegation[]): Hex {
  return encodeSdkDelegations(delegations);
}

/**
 * Encode an Execution struct for use in callData.
 *
 * Delegates to the SDK's `createExecution()`.
 *
 * @param execution - The execution to encode.
 * @returns The ABI-encoded execution.
 */
export function encodeExecution(execution: Execution): Hex {
  const sdkExecution = createSdkExecution({
    target: execution.target,
    value: BigInt(execution.value),
    callData: execution.callData,
  });
  return encodeAbiParameters(
    parseAbiParameters('address target, uint256 value, bytes callData'),
    [sdkExecution.target, sdkExecution.value, sdkExecution.callData],
  );
}

/**
 * Build the callData for `DelegationManager.redeemDelegations`.
 *
 * Delegates to the SDK's `DelegationManager.encode.redeemDelegations()`.
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
  return buildSdkRedeemCallData(options);
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
 * @returns An unsigned UserOperation.
 */
export function buildDelegationUserOp(options: {
  sender: Address;
  nonce: Hex;
  delegations: Delegation[];
  execution: Execution;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
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
