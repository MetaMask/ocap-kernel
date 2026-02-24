/**
 * Bundler client using raw fetch for ERC-4337 interactions.
 *
 * Avoids viem's createClient/http which use Math.random() (blocked under
 * SES lockdown). All methods are simple JSON-RPC calls over fetch.
 *
 * @module lib/bundler-client
 */

import type { Address, Hex } from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

// Monotonic counter for JSON-RPC request IDs.
let bundlerRequestId = 0;

/**
 * Configuration for the bundler client.
 */
export type BundlerClientConfig = {
  bundlerUrl: string;
  rpcUrl?: string;
  chainId: number;
  apiKey?: string;
};

/**
 * Result from a paymaster sponsorship request.
 */
export type PaymasterSponsorResult = {
  paymaster: Address;
  paymasterData: Hex;
  paymasterVerificationGasLimit: Hex;
  paymasterPostOpGasLimit: Hex;
  callGasLimit: Hex;
  verificationGasLimit: Hex;
  preVerificationGas: Hex;
};

/**
 * UserOperation type for ERC-4337 v0.7 (simplified for bundler RPC).
 */
type UserOp07 = Record<string, unknown>;

/**
 * A bundler client with ERC-4337 capabilities.
 */
export type ViemBundlerClient = {
  sendUserOperation: (options: {
    userOp: UserOp07;
    entryPointAddress: Address;
  }) => Promise<Hex>;
  estimateUserOperationGas: (options: {
    userOp: Partial<UserOp07>;
    entryPointAddress: Address;
  }) => Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }>;
  sponsorUserOperation: (options: {
    userOp: Partial<UserOp07>;
    entryPointAddress: Address;
    context?: Record<string, unknown>;
  }) => Promise<PaymasterSponsorResult>;
  getUserOperationReceipt: (hash: Hex) => Promise<unknown>;
  waitForUserOperationReceipt: (options: {
    hash: Hex;
    pollingInterval?: number;
    timeout?: number;
  }) => Promise<unknown>;
};

const BUNDLER_MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

const hasTimers = typeof globalThis.setTimeout === 'function';

/**
 * Send a JSON-RPC request to the bundler with retries.
 *
 * @param bundlerUrl - The bundler RPC URL.
 * @param method - The JSON-RPC method.
 * @param params - The method parameters.
 * @returns The JSON-RPC result.
 */
async function bundlerRpc(
  bundlerUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  bundlerRequestId += 1;
  const id = bundlerRequestId;

  if (!hasTimers) {
    return bundlerRpcOnce(bundlerUrl, id, method, params);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= BUNDLER_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 500 * 2 ** (attempt - 1)),
      );
    }
    try {
      return await bundlerRpcOnce(bundlerUrl, id, method, params);
    } catch (error: unknown) {
      const { status } = error as { status?: number };
      if (status && RETRYABLE_STATUS_CODES.has(status)) {
        lastError = error as Error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('Bundler RPC failed after retries');
}

/**
 * Send a single JSON-RPC request to the bundler (no retries).
 *
 * @param bundlerUrl - The bundler RPC URL.
 * @param id - The JSON-RPC request ID.
 * @param method - The JSON-RPC method.
 * @param params - The method parameters.
 * @returns The JSON-RPC result.
 */
async function bundlerRpcOnce(
  bundlerUrl: string,
  id: number,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(bundlerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  if (!response.ok) {
    const error = new Error(
      `Bundler RPC failed: ${response.status} ${response.statusText}`,
    );
    Object.assign(error, { status: response.status });
    throw error;
  }

  const json = (await response.json()) as {
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
  };

  if (json.error) {
    const detail = json.error.data
      ? ` (${JSON.stringify(json.error.data)})`
      : '';
    throw new Error(
      `Bundler RPC error ${json.error.code}: ${json.error.message}${detail}`,
    );
  }

  return json.result;
}

/**
 * Create a bundler client for ERC-4337 operations.
 *
 * Uses raw fetch instead of viem's createClient to avoid Math.random()
 * usage that is blocked under SES lockdown.
 *
 * @param config - Bundler configuration.
 * @returns A bundler client with ERC-4337 actions.
 */
export function makeBundlerClient(
  config: BundlerClientConfig,
): ViemBundlerClient {
  const bundlerUrl = config.apiKey
    ? `${config.bundlerUrl}?apikey=${config.apiKey}`
    : config.bundlerUrl;

  return harden({
    async sendUserOperation(options: {
      userOp: UserOp07;
      entryPointAddress: Address;
    }): Promise<Hex> {
      return (await bundlerRpc(bundlerUrl, 'eth_sendUserOperation', [
        options.userOp,
        options.entryPointAddress,
      ])) as Hex;
    },

    async estimateUserOperationGas(options: {
      userOp: Partial<UserOp07>;
      entryPointAddress: Address;
    }): Promise<{
      callGasLimit: bigint;
      verificationGasLimit: bigint;
      preVerificationGas: bigint;
    }> {
      const result = (await bundlerRpc(
        bundlerUrl,
        'eth_estimateUserOperationGas',
        [options.userOp, options.entryPointAddress],
      )) as {
        callGasLimit: Hex;
        verificationGasLimit: Hex;
        preVerificationGas: Hex;
      };
      return {
        callGasLimit: BigInt(result.callGasLimit),
        verificationGasLimit: BigInt(result.verificationGasLimit),
        preVerificationGas: BigInt(result.preVerificationGas),
      };
    },

    async sponsorUserOperation(options: {
      userOp: Partial<UserOp07>;
      entryPointAddress: Address;
      context?: Record<string, unknown>;
    }): Promise<PaymasterSponsorResult> {
      return (await bundlerRpc(bundlerUrl, 'pm_sponsorUserOperation', [
        options.userOp,
        options.entryPointAddress,
        options.context ?? {},
      ])) as PaymasterSponsorResult;
    },

    async getUserOperationReceipt(hash: Hex): Promise<unknown> {
      return (
        (await bundlerRpc(bundlerUrl, 'eth_getUserOperationReceipt', [hash])) ??
        null
      );
    },

    async waitForUserOperationReceipt(options: {
      hash: Hex;
      pollingInterval?: number;
      timeout?: number;
    }): Promise<unknown> {
      if (!hasTimers) {
        throw new Error(
          'waitForUserOperationReceipt requires timer support ' +
            '(not available in SES compartments)',
        );
      }
      const { pollingInterval = 2000, timeout = 60000 } = options;
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        const receipt = await bundlerRpc(
          bundlerUrl,
          'eth_getUserOperationReceipt',
          [options.hash],
        );
        if (receipt !== null && receipt !== undefined) {
          return receipt;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, pollingInterval),
        );
      }
      throw new Error(
        `UserOperation ${options.hash} not included after ${timeout}ms`,
      );
    },
  });
}
