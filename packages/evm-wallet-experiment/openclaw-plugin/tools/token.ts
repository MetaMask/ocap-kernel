import { Type } from '@sinclair/typebox';

import type { WalletCaller } from '../daemon.ts';
import { resolveTokenBySymbol } from '../token-resolver.ts';
import type { OpenClawPluginApi, ToolResponse } from '../types.ts';
import {
  ETH_ADDRESS_RE,
  errorMessage,
  formatTxResult,
  formatToolResult,
  makeError,
  makeText,
  parseDecimalAmount,
  resolveToken,
  resolveTransactionResult,
} from '../utils.ts';

/**
 * Register ERC-20 token tools: resolve, balance, send, info.
 *
 * @param api - The OpenClaw plugin API.
 * @param wallet - Wallet caller function.
 */
export function registerTokenTools(
  api: OpenClawPluginApi,
  wallet: WalletCaller,
): void {
  // -- wallet_token_resolve -------------------------------------------------

  api.registerTool({
    name: 'wallet_token_resolve',
    label: 'Resolve token',
    description:
      'Resolve a token symbol or name (e.g. "USDC", "Uniswap") to its contract address on the current chain. Not available for testnets.',
    parameters: Type.Object({
      query: Type.String({
        description:
          'Token symbol or name to search for (e.g. "USDC", "DAI", "Uniswap")',
      }),
    }),
    async execute(
      _id: string,
      params: { query: string },
    ): Promise<ToolResponse> {
      try {
        const caps = (await wallet('getCapabilities', [], 10_000)) as Record<
          string,
          unknown
        >;
        const chainId = typeof caps?.chainId === 'number' ? caps.chainId : 0;
        if (chainId === 0) {
          return makeError(
            'Could not determine chain ID from wallet capabilities.',
          );
        }

        const matches = await resolveTokenBySymbol({
          query: params.query,
          chainId,
        });

        if (matches.length === 0) {
          return makeText(
            `No tokens matching "${params.query}" found on chain ${String(chainId)}.`,
          );
        }

        const lines = matches.map(
          (match) => `${match.name} (${match.symbol}): ${match.address}`,
        );
        return makeText(lines.join('\n'));
      } catch (error: unknown) {
        return makeError(`Token lookup failed: ${errorMessage(error)}`);
      }
    },
  });

  // -- wallet_token_balance -------------------------------------------------

  api.registerTool({
    name: 'wallet_token_balance',
    label: 'Wallet token balance',
    description:
      'Get ERC-20 token balance. Accepts a contract address or token symbol (e.g. "USDC").',
    parameters: Type.Object({
      token: Type.String({
        description:
          'ERC-20 token contract address (0x...) or symbol (e.g. "USDC")',
      }),
      address: Type.Optional(
        Type.String({
          description:
            'Owner address (0x...). Omit to check the first wallet account.',
        }),
      ),
    }),
    async execute(
      _id: string,
      params: { token: string; address?: string },
    ): Promise<ToolResponse> {
      let tokenAddress: string;
      try {
        const resolved = await resolveToken({ token: params.token, wallet });
        tokenAddress = resolved.address;
      } catch (error: unknown) {
        return makeError(errorMessage(error));
      }

      try {
        let owner = params.address;
        if (!owner) {
          const accounts = await wallet('getAccounts', []);
          if (Array.isArray(accounts) && accounts.length > 0) {
            owner = accounts[0] as string;
          }
        }

        if (!owner || !ETH_ADDRESS_RE.test(owner)) {
          return makeError('No valid owner address available.');
        }

        const [rawBalance, metadata] = await Promise.all([
          wallet('getTokenBalance', [{ token: tokenAddress, owner }]),
          wallet('getTokenMetadata', [{ token: tokenAddress }]) as Promise<
            Record<string, unknown>
          >,
        ]);

        const balance = typeof rawBalance === 'string' ? rawBalance : '0';
        const symbol =
          typeof metadata?.symbol === 'string' ? metadata.symbol : '???';
        const decimals =
          typeof metadata?.decimals === 'number' ? metadata.decimals : 18;

        // Format human-readable amount
        const raw = BigInt(balance);
        const divisor = 10n ** BigInt(decimals);
        const whole = raw / divisor;
        const frac = raw % divisor;
        const fracStr = frac
          .toString()
          .padStart(decimals, '0')
          .replace(/0+$/u, '');
        const formatted = fracStr
          ? `${String(whole)}.${fracStr}`
          : String(whole);

        return makeText(`${owner}: ${formatted} ${symbol} (raw: ${balance})`);
      } catch (error: unknown) {
        return makeError(`Token balance lookup failed: ${errorMessage(error)}`);
      }
    },
  });

  // -- wallet_token_send ----------------------------------------------------

  api.registerTool({
    name: 'wallet_token_send',
    label: 'Wallet token send',
    description:
      'Send ERC-20 tokens to an address. Accepts a contract address or token symbol (e.g. "USDC").',
    parameters: Type.Object({
      token: Type.String({
        description:
          'ERC-20 token contract address (0x...) or symbol (e.g. "USDC")',
      }),
      to: Type.String({ description: 'Recipient address (0x...)' }),
      amount: Type.String({
        description:
          "Amount of tokens as a decimal string (e.g. '100.5' for 100.5 USDC).",
      }),
    }),
    async execute(
      _id: string,
      params: { token: string; to: string; amount: string },
    ): Promise<ToolResponse> {
      if (!ETH_ADDRESS_RE.test(params.to)) {
        return makeError(
          'Invalid recipient address. Must be 0x followed by 40 hex characters.',
        );
      }

      let tokenAddress: string;
      try {
        const resolved = await resolveToken({ token: params.token, wallet });
        tokenAddress = resolved.address;
      } catch (error: unknown) {
        return makeError(errorMessage(error));
      }

      try {
        // Get token decimals to convert the decimal amount to raw units
        const metadata = (await wallet('getTokenMetadata', [
          { token: tokenAddress },
        ])) as Record<string, unknown>;

        if (typeof metadata?.decimals !== 'number') {
          return makeError(
            'Could not determine token decimals. Cannot safely convert amount.',
          );
        }
        const { decimals } = metadata;
        const symbol =
          typeof metadata?.symbol === 'string' ? metadata.symbol : '???';

        const rawAmount = parseDecimalAmount(params.amount, decimals);
        if (rawAmount <= 0n) {
          return makeError('Amount must be greater than zero.');
        }

        const result = await wallet('sendErc20Transfer', [
          {
            token: tokenAddress,
            to: params.to,
            amount: `0x${rawAmount.toString(16)}`,
          },
        ]);

        if (typeof result !== 'string' || !result.startsWith('0x')) {
          return makeError(
            `Transaction submitted but no valid hash returned (got ${JSON.stringify(result)}).`,
          );
        }
        const txResult = await resolveTransactionResult({
          hash: result,
          wallet,
        });

        return makeText(
          formatTxResult(
            txResult,
            `Sent ${params.amount} ${symbol} to ${params.to}`,
          ),
        );
      } catch (error: unknown) {
        return makeError(`Token send failed: ${errorMessage(error)}`);
      }
    },
  });

  // -- wallet_token_info ----------------------------------------------------

  api.registerTool({
    name: 'wallet_token_info',
    label: 'Wallet token info',
    description:
      'Get ERC-20 token metadata: name, symbol, and decimals. Accepts address or symbol.',
    parameters: Type.Object({
      token: Type.String({
        description:
          'ERC-20 token contract address (0x...) or symbol (e.g. "USDC")',
      }),
    }),
    async execute(
      _id: string,
      params: { token: string },
    ): Promise<ToolResponse> {
      let tokenAddress: string;
      try {
        const resolved = await resolveToken({ token: params.token, wallet });
        tokenAddress = resolved.address;
      } catch (error: unknown) {
        return makeError(errorMessage(error));
      }

      try {
        const result = await wallet('getTokenMetadata', [
          { token: tokenAddress },
        ]);
        return makeText(formatToolResult(result));
      } catch (error: unknown) {
        return makeError(`Token info lookup failed: ${errorMessage(error)}`);
      }
    },
  });
}
