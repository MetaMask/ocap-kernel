/**
 * Bundler client wrapper using viem's bundler transport.
 *
 * Replaces the manual JSON-RPC bundler in `lib/bundler.ts` with
 * viem's `createBundlerClient` for standardized ERC-4337 interactions.
 *
 * @module lib/bundler-client
 */

import { createClient, http } from 'viem';
import type { Chain } from 'viem';
import { bundlerActions } from 'viem/account-abstraction';
import type { BundlerActions, UserOperation } from 'viem/account-abstraction';

import type { Address, Hex } from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

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
 * A viem-based bundler client with ERC-4337 capabilities.
 */
export type ViemBundlerClient = {
  sendUserOperation: (options: {
    userOp: UserOperation<'0.7'>;
    entryPointAddress: Address;
  }) => Promise<Hex>;
  estimateUserOperationGas: (options: {
    userOp: Partial<UserOperation<'0.7'>>;
    entryPointAddress: Address;
  }) => Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }>;
  sponsorUserOperation: (options: {
    userOp: Partial<UserOperation<'0.7'>>;
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

/**
 * Resolve a chain object from a chain ID.
 *
 * @param chainId - The numeric chain ID.
 * @returns A minimal chain definition.
 */
function resolveChain(chainId: number): Chain {
  return {
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [] } },
  };
}

/**
 * Create a viem bundler client for ERC-4337 operations.
 *
 * @param config - Bundler configuration.
 * @returns A bundler client with ERC-4337 actions.
 */
export function makeBundlerClient(
  config: BundlerClientConfig,
): ViemBundlerClient {
  const chain = resolveChain(config.chainId);
  const bundlerUrl = config.apiKey
    ? `${config.bundlerUrl}?apikey=${config.apiKey}`
    : config.bundlerUrl;

  const client = createClient({
    chain,
    transport: http(bundlerUrl),
  }).extend(bundlerActions) as ReturnType<typeof createClient> & BundlerActions;

  return harden({
    async sendUserOperation(options: {
      userOp: UserOperation<'0.7'>;
      entryPointAddress: Address;
    }): Promise<Hex> {
      const result = await client.request({
        method: 'eth_sendUserOperation' as never,
        params: [options.userOp, options.entryPointAddress] as never,
      });
      return result as Hex;
    },

    async estimateUserOperationGas(options: {
      userOp: Partial<UserOperation<'0.7'>>;
      entryPointAddress: Address;
    }): Promise<{
      callGasLimit: bigint;
      verificationGasLimit: bigint;
      preVerificationGas: bigint;
    }> {
      const result = await client.request({
        method: 'eth_estimateUserOperationGas' as never,
        params: [options.userOp, options.entryPointAddress] as never,
      });
      const estimate = result as {
        callGasLimit: Hex;
        verificationGasLimit: Hex;
        preVerificationGas: Hex;
      };
      return {
        callGasLimit: BigInt(estimate.callGasLimit),
        verificationGasLimit: BigInt(estimate.verificationGasLimit),
        preVerificationGas: BigInt(estimate.preVerificationGas),
      };
    },

    async sponsorUserOperation(options: {
      userOp: Partial<UserOperation<'0.7'>>;
      entryPointAddress: Address;
      context?: Record<string, unknown>;
    }): Promise<PaymasterSponsorResult> {
      const result = await client.request({
        method: 'pm_sponsorUserOperation' as never,
        params: [
          options.userOp,
          options.entryPointAddress,
          options.context ?? {},
        ] as never,
      });
      return result as PaymasterSponsorResult;
    },

    async getUserOperationReceipt(hash: Hex): Promise<unknown> {
      const result = await client.request({
        method: 'eth_getUserOperationReceipt' as never,
        params: [hash] as never,
      });
      return result ?? null;
    },

    async waitForUserOperationReceipt(options: {
      hash: Hex;
      pollingInterval?: number;
      timeout?: number;
    }): Promise<unknown> {
      const { pollingInterval = 2000, timeout = 60000 } = options;
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        const receipt = await client.request({
          method: 'eth_getUserOperationReceipt' as never,
          params: [options.hash] as never,
        });
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
