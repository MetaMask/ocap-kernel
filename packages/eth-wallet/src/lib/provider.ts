import { createPublicClient, http, defineChain } from 'viem';
import type { Chain } from 'viem';

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

/**
 * Create a viem Chain object from our ChainConfig.
 *
 * @param config - The chain configuration.
 * @returns The viem Chain object.
 */
function toViemChain(config: ChainConfig): Chain {
  return defineChain({
    id: config.chainId,
    name: config.name ?? `Chain ${config.chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
  });
}

/**
 * Create a JSON-RPC provider for the given chain.
 *
 * @param config - The chain configuration.
 * @returns The provider instance.
 */
export function makeProvider(config: ChainConfig): Provider {
  const chain = toViemChain(config);
  const client = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  return harden({
    async request(method: string, params?: unknown[]): Promise<unknown> {
      // Use the transport directly for generic JSON-RPC passthrough
      const response = await client.transport.request({
        method,
        params: params ?? [],
      });
      return response;
    },

    async broadcastTransaction(signedTx: Hex): Promise<Hex> {
      return client.sendRawTransaction({
        serializedTransaction: signedTx,
      });
    },

    async getBalance(address: Address): Promise<string> {
      const balance = await client.getBalance({
        address,
      });
      return `0x${balance.toString(16)}`;
    },

    async getChainId(): Promise<number> {
      return client.getChainId();
    },

    async getNonce(address: Address): Promise<number> {
      return client.getTransactionCount({
        address,
      });
    },
  });
}
