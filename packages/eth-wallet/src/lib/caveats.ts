import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { ENFORCER_ADDRESSES } from '../constants.ts';
import type { Address, Caveat, CaveatType, Hex } from '../types.ts';

/**
 * Encode caveat terms for the AllowedTargets enforcer.
 * Restricts delegation to only call specific contract addresses.
 *
 * @param targets - The allowed target addresses.
 * @returns The ABI-encoded terms.
 */
export function encodeAllowedTargets(targets: Address[]): Hex {
  return encodeAbiParameters(parseAbiParameters('address[]'), [targets]);
}

/**
 * Encode caveat terms for the AllowedMethods enforcer.
 * Restricts delegation to only call specific function selectors.
 *
 * @param selectors - The 4-byte function selectors.
 * @returns The ABI-encoded terms.
 */
export function encodeAllowedMethods(selectors: Hex[]): Hex {
  return encodeAbiParameters(parseAbiParameters('bytes4[]'), [selectors]);
}

/**
 * Encode caveat terms for the ValueLte enforcer.
 * Limits the ETH value that can be sent in a single call.
 *
 * @param maxValue - The maximum value in wei (as bigint).
 * @returns The ABI-encoded terms.
 */
export function encodeValueLte(maxValue: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('uint256'), [maxValue]);
}

/**
 * Encode caveat terms for the ERC20TransferAmount enforcer.
 * Limits the amount of an ERC-20 token that can be transferred.
 *
 * @param options - Options for the caveat.
 * @param options.token - The ERC-20 token contract address.
 * @param options.amount - The maximum amount of tokens.
 * @returns The ABI-encoded terms.
 */
export function encodeErc20TransferAmount(options: {
  token: Address;
  amount: bigint;
}): Hex {
  return encodeAbiParameters(parseAbiParameters('address, uint256'), [
    options.token,
    options.amount,
  ]);
}

/**
 * Encode caveat terms for the LimitedCalls enforcer.
 * Limits the total number of calls that can be made with this delegation.
 *
 * @param maxCalls - The maximum number of calls.
 * @returns The ABI-encoded terms.
 */
export function encodeLimitedCalls(maxCalls: number): Hex {
  return encodeAbiParameters(parseAbiParameters('uint256'), [BigInt(maxCalls)]);
}

/**
 * Encode caveat terms for the Timestamp enforcer.
 * Restricts delegation usage to a specific time window.
 *
 * @param options - Options for the caveat.
 * @param options.after - The earliest allowed timestamp (unix seconds).
 * @param options.before - The latest allowed timestamp (unix seconds).
 * @returns The ABI-encoded terms.
 */
export function encodeTimestamp(options: {
  after: number;
  before: number;
}): Hex {
  return encodeAbiParameters(parseAbiParameters('uint128, uint128'), [
    BigInt(options.after),
    BigInt(options.before),
  ]);
}

/**
 * Build a Caveat struct from a type and encoded terms.
 *
 * @param options - Options for the caveat.
 * @param options.type - The caveat type.
 * @param options.terms - The ABI-encoded terms.
 * @param options.enforcerAddress - Optional override for the enforcer address.
 * @returns The Caveat struct.
 */
export function makeCaveat(options: {
  type: CaveatType;
  terms: Hex;
  enforcerAddress?: Address;
}): Caveat {
  return {
    enforcer: options.enforcerAddress ?? ENFORCER_ADDRESSES[options.type],
    terms: options.terms,
    type: options.type,
  };
}

/**
 * Get the well-known enforcer address for a caveat type.
 *
 * @param caveatType - The caveat type.
 * @returns The enforcer address.
 */
export function getEnforcerAddress(caveatType: CaveatType): Address {
  return ENFORCER_ADDRESSES[caveatType];
}
