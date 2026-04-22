import type { Address, Hex } from '../types.ts';

/**
 * Apply a percentage buffer to a hex gas value.
 *
 * @param gasHex - The gas value as a hex string.
 * @param bufferPercent - The buffer percentage to add (e.g. 10 for 10%).
 * @returns The buffered gas value as a hex string.
 */
export function applyGasBuffer(gasHex: Hex, bufferPercent: number): Hex {
  const gas = BigInt(gasHex);
  const buffered = gas + (gas * BigInt(bufferPercent)) / 100n;
  return `0x${buffered.toString(16)}`;
}

/**
 * Validate that an `eth_estimateGas` response is a valid hex string.
 *
 * @param result - The raw RPC response.
 * @returns The validated hex string.
 * @throws If the result is not a hex string.
 */
export function validateGasEstimate(result: unknown): Hex {
  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new Error(
      `eth_estimateGas returned unexpected value: ${String(result)}`,
    );
  }
  return result as Hex;
}

/**
 * Validate that a token `eth_call` response is a usable hex string.
 *
 * @param result - The raw RPC response.
 * @param method - The ERC-20 method name (for error context).
 * @param token - The token address (for error context).
 * @returns The validated hex string.
 * @throws If the result is not a non-empty hex string.
 */
export function validateTokenCallResult(
  result: unknown,
  method: string,
  token: Address,
): Hex {
  if (
    typeof result !== 'string' ||
    !result.startsWith('0x') ||
    result === '0x'
  ) {
    throw new Error(
      `${method}() call to token ${token} returned unexpected value: ${String(result)}`,
    );
  }
  return result as Hex;
}
