import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';
import { encodeAbiParameters, http, parseAbiParameters } from 'viem';

import { makeProvider } from '../lib/provider.ts';
import type { Provider } from '../lib/provider.ts';
import type { Address, ChainConfig, Hex, UserOperation } from '../types.ts';

/**
 * Function selector for EntryPoint.getNonce(address,uint192).
 */
const GET_NONCE_SELECTOR = '0x35567e1a' as Hex;

/**
 * Vat powers for the provider vat.
 */
type VatPowers = Record<string, unknown>;

/**
 * Build the root object for the provider vat.
 *
 * The provider vat handles all Ethereum JSON-RPC communication.
 * It wraps the lib/provider module in an exo interface.
 *
 * @param _vatPowers - Special powers granted to this vat.
 * @param _parameters - Initialization parameters.
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the provider vat.
 */
export function buildRootObject(
  _vatPowers: VatPowers,
  _parameters: unknown,
  baggage: Baggage,
): object {
  let provider: Provider | undefined;

  // Restore provider from persisted chain config
  if (baggage.has('chainConfig')) {
    const chainConfig = baggage.get('chainConfig') as ChainConfig;
    provider = makeProvider(chainConfig);
  }

  return makeDefaultExo('walletProvider', {
    async bootstrap(): Promise<void> {
      // No services needed for the provider vat
    },

    async configure(chainConfig: ChainConfig): Promise<void> {
      provider = makeProvider(chainConfig);

      if (baggage.has('chainConfig')) {
        baggage.set('chainConfig', chainConfig);
      } else {
        baggage.init('chainConfig', chainConfig);
      }
    },

    async request(method: string, params?: unknown[]): Promise<unknown> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      return provider.request(method, params);
    },

    async broadcastTransaction(signedTx: Hex): Promise<Hex> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      return provider.broadcastTransaction(signedTx);
    },

    async getBalance(address: Address): Promise<string> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      return provider.getBalance(address);
    },

    async getChainId(): Promise<number> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      return provider.getChainId();
    },

    async getNonce(address: Address): Promise<number> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      return provider.getNonce(address);
    },

    async submitUserOp(options: {
      bundlerUrl: string;
      entryPoint: Hex;
      userOp: UserOperation;
    }): Promise<Hex> {
      const transport = http(options.bundlerUrl)({
        chain: undefined,
        retryCount: 0,
      });
      const result = await transport.request({
        method: 'eth_sendUserOperation' as never,
        params: [options.userOp, options.entryPoint] as never,
      });
      return result as Hex;
    },

    async estimateUserOpGas(options: {
      bundlerUrl: string;
      entryPoint: Hex;
      userOp: UserOperation;
    }): Promise<{
      callGasLimit: Hex;
      verificationGasLimit: Hex;
      preVerificationGas: Hex;
    }> {
      const transport = http(options.bundlerUrl)({
        chain: undefined,
        retryCount: 0,
      });
      const result = await transport.request({
        method: 'eth_estimateUserOperationGas' as never,
        params: [options.userOp, options.entryPoint] as never,
      });
      return result as {
        callGasLimit: Hex;
        verificationGasLimit: Hex;
        preVerificationGas: Hex;
      };
    },

    async getEntryPointNonce(options: {
      entryPoint: Address;
      sender: Address;
      key?: Hex;
    }): Promise<Hex> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      const encoded = encodeAbiParameters(
        parseAbiParameters('address, uint192'),
        [options.sender, options.key ? BigInt(options.key) : 0n],
      );
      const callData = (GET_NONCE_SELECTOR + encoded.slice(2)) as Hex;

      const result = await provider.request('eth_call', [
        { to: options.entryPoint, data: callData },
        'latest',
      ]);
      return result as Hex;
    },

    async getUserOpReceipt(options: {
      bundlerUrl: string;
      userOpHash: Hex;
    }): Promise<unknown> {
      const transport = http(options.bundlerUrl)({
        chain: undefined,
        retryCount: 0,
      });
      const result = await transport.request({
        method: 'eth_getUserOperationReceipt' as never,
        params: [options.userOpHash] as never,
      });
      return result ?? null;
    },

    async getGasFees(): Promise<{
      maxFeePerGas: Hex;
      maxPriorityFeePerGas: Hex;
    }> {
      if (!provider) {
        throw new Error('Provider not configured');
      }
      const [block, priorityFee] = await Promise.all([
        provider.request('eth_getBlockByNumber', ['latest', false]),
        provider
          .request('eth_maxPriorityFeePerGas', [])
          .catch(() => '0x3b9aca00'),
      ]);
      const baseFee = BigInt(
        (block as { baseFeePerGas: string }).baseFeePerGas ?? '0x0',
      );
      const priority = BigInt(priorityFee as string);
      // maxFeePerGas = 2 * baseFee + maxPriorityFeePerGas (standard EIP-1559 heuristic)
      const maxFee = baseFee * 2n + priority;
      return {
        maxFeePerGas: `0x${maxFee.toString(16)}`,
        maxPriorityFeePerGas: `0x${priority.toString(16)}`,
      };
    },
  });
}
