/**
 * @deprecated Use `lib/bundler-client.ts` (`makeBundlerClient()`) instead.
 * This module is retained for backwards compatibility and will be removed
 * in a future release.
 */

import type { Hex, UserOperation } from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * Configuration for connecting to an ERC-4337 bundler.
 *
 * @deprecated Use `BundlerClientConfig` from `lib/bundler-client.ts` instead.
 */
export type BundlerConfig = {
  url: string;
  entryPoint: Hex;
};

/**
 * Receipt returned after a UserOperation is included on-chain.
 */
export type UserOpReceipt = {
  userOpHash: Hex;
  sender: Hex;
  nonce: Hex;
  success: boolean;
  actualGasCost: Hex;
  actualGasUsed: Hex;
  receipt: {
    transactionHash: Hex;
    blockNumber: Hex;
  };
};

/**
 * Gas estimates returned by the bundler.
 */
export type UserOpGasEstimate = {
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
};

/**
 * Send a JSON-RPC request to the bundler.
 *
 * @param url - The bundler RPC URL.
 * @param method - The RPC method.
 * @param params - The RPC parameters.
 * @returns The RPC result.
 */
async function bundlerRpc(
  url: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(
      `Bundler HTTP error: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    result?: unknown;
    error?: { message: string; code: number };
  };

  if (json.error) {
    throw new Error(`Bundler RPC error: ${json.error.message}`);
  }

  return json.result;
}

/**
 * Submit a signed UserOperation to the bundler.
 *
 * @deprecated Use `makeBundlerClient().sendUserOperation()` instead.
 * @param config - The bundler configuration.
 * @param userOp - The signed UserOperation.
 * @returns The UserOperation hash.
 */
export async function submitUserOp(
  config: BundlerConfig,
  userOp: UserOperation,
): Promise<Hex> {
  const result = await bundlerRpc(config.url, 'eth_sendUserOperation', [
    userOp,
    config.entryPoint,
  ]);
  return harden(result as Hex);
}

/**
 * Estimate gas for a UserOperation.
 *
 * @deprecated Use `makeBundlerClient().estimateUserOperationGas()` instead.
 * @param config - The bundler configuration.
 * @param userOp - The UserOperation to estimate.
 * @returns The gas estimates.
 */
export async function estimateUserOpGas(
  config: BundlerConfig,
  userOp: UserOperation,
): Promise<UserOpGasEstimate> {
  const result = await bundlerRpc(config.url, 'eth_estimateUserOperationGas', [
    userOp,
    config.entryPoint,
  ]);
  return harden(result as UserOpGasEstimate);
}

/**
 * Get the receipt for a UserOperation.
 *
 * @deprecated Use `makeBundlerClient().getUserOperationReceipt()` instead.
 * @param config - The bundler configuration.
 * @param userOpHash - The UserOperation hash.
 * @returns The receipt, or null if not yet included.
 */
export async function getUserOpReceipt(
  config: BundlerConfig,
  userOpHash: Hex,
): Promise<UserOpReceipt | null> {
  const result = await bundlerRpc(config.url, 'eth_getUserOperationReceipt', [
    userOpHash,
  ]);
  const receipt = (result as UserOpReceipt) ?? null;
  return receipt ? harden(receipt) : null;
}

/**
 * Poll for a UserOperation receipt until it is included.
 *
 * @deprecated Use `makeBundlerClient().waitForUserOperationReceipt()` instead.
 * @param config - The bundler configuration.
 * @param userOpHash - The UserOperation hash.
 * @param options - Polling options.
 * @param options.pollIntervalMs - How often to poll (default: 2000ms).
 * @param options.timeoutMs - Maximum time to wait (default: 60000ms).
 * @returns The receipt.
 */
export async function waitForUserOp(
  config: BundlerConfig,
  userOpHash: Hex,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<UserOpReceipt> {
  if (typeof globalThis.setTimeout !== 'function') {
    throw new Error(
      'waitForUserOp requires timer support (not available in SES compartments)',
    );
  }
  const { pollIntervalMs = 2000, timeoutMs = 60000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const receipt = await getUserOpReceipt(config, userOpHash);
    if (receipt) {
      return receipt;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `UserOperation ${userOpHash} not included after ${timeoutMs}ms`,
  );
}
