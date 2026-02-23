import { numberToHex } from 'viem';

import type { Address, ChainConfig, Hex } from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

/**
 * A JSON-RPC provider for Ethereum.
 */
export type Provider = {
  request: (method: string, params?: unknown[]) => Promise<unknown>;
  broadcastTransaction: (signedTx: Hex) => Promise<Hex>;
  getBalance: (address: Address) => Promise<string>;
  getChainId: () => Promise<number>;
  getNonce: (address: Address) => Promise<number>;
};

// Monotonic counter for JSON-RPC request IDs (replaces Math.random under SES).
let rpcRequestId = 0;

/**
 * Send a JSON-RPC request to the given URL.
 *
 * @param rpcUrl - The RPC endpoint URL.
 * @param method - The JSON-RPC method name.
 * @param params - The method parameters.
 * @returns The JSON-RPC result.
 */
async function jsonRpc(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  rpcRequestId += 1;
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: rpcRequestId,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `RPC request failed: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }

  return json.result;
}

/**
 * Create a JSON-RPC provider for the given chain.
 *
 * Uses raw fetch instead of viem's createPublicClient to avoid
 * Math.random() usage that is blocked under SES lockdown.
 *
 * @param config - The chain configuration.
 * @returns The provider instance.
 */
export function makeProvider(config: ChainConfig): Provider {
  const { rpcUrl } = config;

  return harden({
    async request(method: string, params?: unknown[]): Promise<unknown> {
      return jsonRpc(rpcUrl, method, params);
    },

    async broadcastTransaction(signedTx: Hex): Promise<Hex> {
      return (await jsonRpc(rpcUrl, 'eth_sendRawTransaction', [
        signedTx,
      ])) as Hex;
    },

    async getBalance(address: Address): Promise<string> {
      return (await jsonRpc(rpcUrl, 'eth_getBalance', [
        address,
        'latest',
      ])) as string;
    },

    async getChainId(): Promise<number> {
      const result = (await jsonRpc(rpcUrl, 'eth_chainId')) as string;
      return Number(result);
    },

    async getNonce(address: Address): Promise<number> {
      const result = (await jsonRpc(rpcUrl, 'eth_getTransactionCount', [
        address,
        'latest',
      ])) as string;
      return Number(result);
    },
  });
}

// Re-export numberToHex for backward compatibility (used by provider-vat gas fees)
export { numberToHex };
