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

const RPC_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

// SES vat compartments lack setTimeout and AbortController.
const hasTimers = typeof globalThis.setTimeout === 'function';

/**
 * Send a JSON-RPC request to the given URL with retries.
 *
 * @param rpcUrl - The RPC endpoint URL.
 * @param method - The JSON-RPC method name.
 * @param params - The method parameters.
 * @param counter - Monotonic counter for JSON-RPC request IDs.
 * @param counter.value - The current counter value (mutated on each call).
 * @returns The JSON-RPC result.
 */
async function jsonRpc(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
  counter: { value: number } = { value: 0 },
): Promise<unknown> {
  counter.value += 1;
  const id = counter.value;

  if (!hasTimers) {
    return jsonRpcOnce(rpcUrl, id, method, params);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 500 * 2 ** (attempt - 1)),
      );
    }
    try {
      return await jsonRpcOnce(rpcUrl, id, method, params);
    } catch (error: unknown) {
      const { status } = error as { status?: number };
      if (status && RETRYABLE_STATUS_CODES.has(status)) {
        lastError = error as Error;
        continue;
      }
      const message = (error as Error).message ?? '';
      if (
        message.includes('timed out') ||
        (error as Error).name === 'AbortError'
      ) {
        lastError = new Error(
          `RPC request timed out after ${RPC_TIMEOUT_MS}ms`,
        );
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('RPC request failed after retries');
}

/**
 * Send a single JSON-RPC request (no retries).
 *
 * @param rpcUrl - The RPC endpoint URL.
 * @param id - The JSON-RPC request ID.
 * @param method - The JSON-RPC method name.
 * @param params - The method parameters.
 * @returns The JSON-RPC result.
 */
async function jsonRpcOnce(
  rpcUrl: string,
  id: number,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  };

  const response = await fetch(rpcUrl, init);

  if (!response.ok) {
    const error = new Error(
      `RPC request failed: ${response.status} ${response.statusText}`,
    );
    Object.assign(error, { status: response.status });
    throw error;
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
 * @param config - The chain configuration.
 * @returns The provider instance.
 */
export function makeProvider(config: ChainConfig): Provider {
  const { rpcUrl } = config;

  // Monotonic counter for JSON-RPC request IDs, scoped to this provider instance.
  const requestCounter = { value: 0 };

  return harden({
    async request(method: string, params?: unknown[]): Promise<unknown> {
      return jsonRpc(rpcUrl, method, params, requestCounter);
    },

    async broadcastTransaction(signedTx: Hex): Promise<Hex> {
      return (await jsonRpc(
        rpcUrl,
        'eth_sendRawTransaction',
        [signedTx],
        requestCounter,
      )) as Hex;
    },

    async getBalance(address: Address): Promise<string> {
      return (await jsonRpc(
        rpcUrl,
        'eth_getBalance',
        [address, 'latest'],
        requestCounter,
      )) as string;
    },

    async getChainId(): Promise<number> {
      const result = (await jsonRpc(
        rpcUrl,
        'eth_chainId',
        [],
        requestCounter,
      )) as string;
      return Number(result);
    },

    async getNonce(address: Address): Promise<number> {
      const result = (await jsonRpc(
        rpcUrl,
        'eth_getTransactionCount',
        [address, 'latest'],
        requestCounter,
      )) as string;
      return Number(result);
    },
  });
}

/**
 * Send an HTTP GET request and parse the JSON response, with retries.
 *
 * @param url - The URL to fetch.
 * @returns The parsed JSON response body.
 */
export async function httpGetJson(url: string): Promise<unknown> {
  if (!hasTimers) {
    return httpGetJsonOnce(url);
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, 500 * 2 ** (attempt - 1)),
      );
    }
    try {
      return await httpGetJsonOnce(url);
    } catch (error: unknown) {
      const { status } = error as { status?: number };
      if (status && RETRYABLE_STATUS_CODES.has(status)) {
        lastError = error as Error;
        continue;
      }
      const message = (error as Error).message ?? '';
      if (
        message.includes('timed out') ||
        (error as Error).name === 'AbortError'
      ) {
        lastError = new Error(
          `HTTP GET request timed out after ${RPC_TIMEOUT_MS}ms`,
        );
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error('HTTP GET request failed after retries');
}

/**
 * Send a single HTTP GET request (no retries).
 *
 * @param url - The URL to fetch.
 * @returns The parsed JSON response body.
 */
async function httpGetJsonOnce(url: string): Promise<unknown> {
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(
      `HTTP GET failed: ${response.status} ${response.statusText}`,
    );
    Object.assign(error, { status: response.status });
    throw error;
  }

  return response.json();
}

// Re-export numberToHex for backward compatibility (used by provider-vat gas fees)
export { numberToHex };
