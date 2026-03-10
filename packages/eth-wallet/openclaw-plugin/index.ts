/**
 * OpenClaw wallet plugin: registers tools that forward to the OCAP daemon.
 *
 * The OCAP daemon runs the eth-wallet subcluster. This plugin sends JSON-RPC
 * messages to the daemon over its Unix socket, routing wallet operations
 * through the kernel's capability system. The AI agent never touches keys.
 *
 * Enable tools via agents.list[].tools.allow: ["wallet_balance", "wallet_send"]
 * or allow all with ["wallet"].
 *
 * Config (optional, in openclaw plugin settings):
 *   ocapCliPath  - Absolute path to the `ocap` CLI (auto-detected from monorepo)
 *   walletKref   - The kernel reference for the wallet coordinator (default: "ko4")
 */
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeWalletCaller } from './daemon.ts';
import type { WalletCaller } from './daemon.ts';
import { resolveTokenBySymbol, resolveTokenParam } from './token-resolver.ts';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = resolvePath(pluginDir, '../../cli/dist/app.mjs');
const DEFAULT_TIMEOUT_MS = 60_000;

const ETH_ADDRESS_RE = /^0x[\da-f]{40}$/iu;
const HEX_VALUE_RE = /^0x[\da-f]+$/iu;

const BLOCK_EXPLORER_URLS: Record<number, string> = {
  1: 'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
};

type ToolResponse = { content: { type: 'text'; text: string }[] };

type OpenClawPluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool: (
    tool: {
      name: string;
      label: string;
      description: string;
      parameters: Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: (...args: any[]) => Promise<ToolResponse>;
    },
    options: { optional: boolean },
  ) => void;
};

/**
 * Format an error response for the plugin.
 *
 * @param text - The error message text.
 * @returns A plugin tool response containing the error.
 */
function makeError(text: string): ToolResponse {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }] };
}

/**
 * Format a successful text response.
 *
 * @param text - The response text.
 * @returns A plugin tool response.
 */
function makeText(text: string): ToolResponse {
  return { content: [{ type: 'text' as const, text }] };
}

/**
 * Convert a decoded wallet result into text for tool responses.
 *
 * @param value - The decoded result.
 * @returns A string suitable for tool output.
 */
function formatToolResult(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Extract error message from an unknown error value.
 *
 * @param error - The caught error.
 * @returns The error message string.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve a token parameter (address or symbol) using wallet chain context.
 *
 * @param options - Resolution options.
 * @param options.token - Token address or symbol/name.
 * @param options.wallet - Wallet caller for chain ID lookup.
 * @returns The resolved address and metadata.
 */
async function resolveToken(options: {
  token: string;
  wallet: WalletCaller;
}): Promise<{
  address: string;
  resolved: boolean;
  name?: string;
  symbol?: string;
}> {
  if (ETH_ADDRESS_RE.test(options.token)) {
    return { address: options.token, resolved: false };
  }
  const caps = (await options.wallet('getCapabilities', [], 10_000)) as Record<
    string,
    unknown
  >;
  const chainId = typeof caps?.chainId === 'number' ? caps.chainId : 0;
  if (chainId === 0) {
    throw new Error(
      'Could not determine chain ID. Provide the token contract address directly.',
    );
  }
  return resolveTokenParam({ token: options.token, chainId });
}

/**
 * Resolve a transaction hash to an on-chain tx hash with explorer link.
 * Best-effort — returns the raw hash on failure.
 *
 * @param options - Resolution options.
 * @param options.hash - The initial hash (may be a UserOp hash).
 * @param options.wallet - Wallet caller.
 * @returns Resolved transaction details.
 */
async function resolveTransactionResult(options: {
  hash: string;
  wallet: WalletCaller;
}): Promise<{ txHash: string; userOpHash?: string; explorerUrl: string }> {
  const { hash, wallet } = options;
  let txHash = hash;
  let userOpHash: string | undefined;
  let explorerUrl = '';

  try {
    const [caps, receipt] = await Promise.all([
      wallet('getCapabilities', [], 10_000) as Promise<Record<string, unknown>>,
      wallet('getTransactionReceipt', [hash], 30_000) as Promise<Record<
        string,
        unknown
      > | null>,
    ]);

    if (receipt) {
      if (typeof receipt.txHash === 'string') {
        txHash = receipt.txHash;
      }
      if (typeof receipt.userOpHash === 'string') {
        userOpHash = receipt.userOpHash;
      }
    }

    const chainId = typeof caps?.chainId === 'number' ? caps.chainId : 0;
    const baseUrl = BLOCK_EXPLORER_URLS[chainId] ?? '';
    if (baseUrl && txHash) {
      explorerUrl = `${baseUrl}/tx/${txHash}`;
    }
  } catch {
    // Best-effort — if resolution fails, return the raw hash
  }

  return { txHash, userOpHash, explorerUrl };
}

/**
 * Format a transaction result into lines of text.
 *
 * @param result - The resolved transaction result.
 * @param result.txHash - The transaction hash.
 * @param result.userOpHash - The UserOp hash, if applicable.
 * @param result.explorerUrl - Block explorer URL.
 * @param prefix - Optional prefix line (e.g. "Sent 100 USDC to 0x...").
 * @returns Formatted text.
 */
function formatTxResult(
  result: { txHash: string; userOpHash?: string; explorerUrl: string },
  prefix?: string,
): string {
  const parts: string[] = [];
  if (prefix) {
    parts.push(prefix);
  }
  parts.push(`Transaction hash: ${result.txHash}`);
  if (result.explorerUrl) {
    parts.push(`Explorer: ${result.explorerUrl}`);
  }
  if (result.userOpHash) {
    parts.push(`UserOp hash: ${result.userOpHash}`);
  }
  return parts.join('\n');
}

/**
 * Convert a decimal ETH or token amount to a BigInt raw value.
 *
 * @param amount - Decimal amount string (e.g. "0.08", "100.5").
 * @param decimals - Number of decimal places.
 * @returns The raw BigInt value.
 */
function parseDecimalAmount(amount: string, decimals: number): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFrac);
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Register the wallet plugin tools.
 *
 * @param api - The OpenClaw plugin API.
 */
export default function register(api: OpenClawPluginApi): void {
  const { pluginConfig } = api;
  const cliPath =
    typeof pluginConfig?.ocapCliPath === 'string'
      ? pluginConfig.ocapCliPath.trim()
      : DEFAULT_CLI;
  const walletKref =
    typeof pluginConfig?.walletKref === 'string'
      ? pluginConfig.walletKref.trim()
      : 'ko4';
  const timeoutMs =
    typeof pluginConfig?.timeoutMs === 'number'
      ? pluginConfig.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const wallet = makeWalletCaller({ cliPath, walletKref, timeoutMs });

  // -- wallet_balance -------------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_balance',
      label: 'Wallet balance',
      description:
        'Get ETH balance. If no address is given, checks all wallet accounts.',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description:
              'Ethereum address (0x...). Omit to check all accounts.',
          },
        },
      },
      async execute(_id: string, params: { address?: string }) {
        try {
          const addresses: string[] = [];

          if (params.address) {
            if (!ETH_ADDRESS_RE.test(params.address)) {
              return makeError(
                'Invalid Ethereum address. Must be 0x followed by 40 hex characters.',
              );
            }
            addresses.push(params.address);
          } else {
            const accounts = await wallet('getAccounts', []);
            if (Array.isArray(accounts)) {
              addresses.push(
                ...accounts.filter(
                  (a: unknown): a is string =>
                    typeof a === 'string' && ETH_ADDRESS_RE.test(a),
                ),
              );
            }
          }

          if (addresses.length === 0) {
            return makeError('No wallet accounts found.');
          }

          const lines: string[] = [];
          for (const addr of addresses) {
            const result = await wallet('request', [
              'eth_getBalance',
              [addr, 'latest'],
            ]);
            if (typeof result !== 'string' || !result.startsWith('0x')) {
              return makeError(
                `Balance query for ${addr} returned an unexpected result. ` +
                  'The RPC node may be unavailable.',
              );
            }
            const balanceHex = result;
            const wei = BigInt(balanceHex);
            const ethAmount = `${(Number(wei) / 1e18).toFixed(6)} ETH`;
            lines.push(`${addr}: ${ethAmount} (${balanceHex})`);
          }
          return makeText(lines.join('\n'));
        } catch (error: unknown) {
          return makeError(`Balance lookup failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );

  // -- wallet_send ----------------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_send',
      label: 'Wallet send',
      description:
        'Send ETH to an address. The kernel handles signing via delegations or peer wallet.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient address (0x...)' },
          value: {
            type: 'string',
            description:
              "Amount of ETH to send as a decimal string (e.g. '0.1' for 0.1 ETH)",
          },
        },
        required: ['to', 'value'],
      },
      async execute(_id: string, params: { to: string; value: string }) {
        if (!ETH_ADDRESS_RE.test(params.to)) {
          return makeError(
            'Invalid recipient address. Must be 0x followed by 40 hex characters.',
          );
        }

        // Convert decimal ETH string to hex wei.
        let hexValue: string;
        if (HEX_VALUE_RE.test(params.value)) {
          hexValue = params.value;
        } else {
          const parsed = parseFloat(params.value);
          if (Number.isNaN(parsed) || parsed <= 0) {
            return makeError(
              "Invalid value. Provide a decimal ETH amount (e.g. '0.1') or hex wei (e.g. '0xde0b6b3a7640000').",
            );
          }
          const wei = parseDecimalAmount(params.value, 18);
          hexValue = `0x${wei.toString(16)}`;
        }

        try {
          const accountsResult = await wallet('getAccounts', []);
          if (!Array.isArray(accountsResult)) {
            return makeError('Wallet returned invalid accounts response.');
          }
          const from = accountsResult.find(
            (account): account is string =>
              typeof account === 'string' && ETH_ADDRESS_RE.test(account),
          );
          if (!from) {
            return makeError('No wallet account available to use as sender.');
          }

          const result = await wallet('sendTransaction', [
            { from, to: params.to, value: hexValue },
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

          return makeText(formatTxResult(txResult));
        } catch (error: unknown) {
          return makeError(`Send transaction failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );

  // -- wallet_token_resolve -------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_token_resolve',
      label: 'Resolve token',
      description:
        'Resolve a token symbol or name (e.g. "USDC", "Uniswap") to its contract address on the current chain. Not available for testnets.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Token symbol or name to search for (e.g. "USDC", "DAI", "Uniswap")',
          },
        },
        required: ['query'],
      },
      async execute(_id: string, params: { query: string }) {
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
    },
    { optional: true },
  );

  // -- wallet_token_balance -------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_token_balance',
      label: 'Wallet token balance',
      description:
        'Get ERC-20 token balance. Accepts a contract address or token symbol (e.g. "USDC").',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description:
              'ERC-20 token contract address (0x...) or symbol (e.g. "USDC")',
          },
          address: {
            type: 'string',
            description:
              'Owner address (0x...). Omit to check the first wallet account.',
          },
        },
        required: ['token'],
      },
      async execute(_id: string, params: { token: string; address?: string }) {
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
          return makeError(
            `Token balance lookup failed: ${errorMessage(error)}`,
          );
        }
      },
    },
    { optional: true },
  );

  // -- wallet_token_send ----------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_token_send',
      label: 'Wallet token send',
      description:
        'Send ERC-20 tokens to an address. Accepts a contract address or token symbol (e.g. "USDC").',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description:
              'ERC-20 token contract address (0x...) or symbol (e.g. "USDC")',
          },
          to: { type: 'string', description: 'Recipient address (0x...)' },
          amount: {
            type: 'string',
            description:
              "Amount of tokens as a decimal string (e.g. '100.5' for 100.5 USDC).",
          },
        },
        required: ['token', 'to', 'amount'],
      },
      async execute(
        _id: string,
        params: { token: string; to: string; amount: string },
      ) {
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
    },
    { optional: true },
  );

  // -- wallet_token_info ----------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_token_info',
      label: 'Wallet token info',
      description:
        'Get ERC-20 token metadata: name, symbol, and decimals. Accepts address or symbol.',
      parameters: {
        type: 'object',
        properties: {
          token: {
            type: 'string',
            description:
              'ERC-20 token contract address (0x...) or symbol (e.g. "USDC")',
          },
        },
        required: ['token'],
      },
      async execute(_id: string, params: { token: string }) {
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
    },
    { optional: true },
  );

  // -- wallet_sign ----------------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_sign',
      label: 'Wallet sign',
      description:
        'Sign a message. May forward to the home kernel for approval.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to sign' },
        },
        required: ['message'],
      },
      async execute(_id: string, params: { message: string }) {
        try {
          const result = await wallet('signMessage', [params.message]);
          return makeText(formatToolResult(result));
        } catch (error: unknown) {
          return makeError(`Sign message failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );

  // -- wallet_capabilities --------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_capabilities',
      label: 'Wallet capabilities',
      description:
        'Check wallet capabilities: local keys, delegations, peer wallet, bundler.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        try {
          const result = await wallet('getCapabilities', []);
          // Strip internal fields the agent shouldn't see
          if (result && typeof result === 'object') {
            const caps = result as Record<string, unknown>;
            delete caps.localAccounts;
            delete caps.hasLocalKeys;
          }
          return makeText(formatToolResult(result));
        } catch (error: unknown) {
          return makeError(`Get capabilities failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );

  // -- wallet_accounts ------------------------------------------------------

  api.registerTool(
    {
      name: 'wallet_accounts',
      label: 'Wallet accounts',
      description: 'List wallet accounts.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        try {
          const result = await wallet('getAccounts', []);
          return makeText(formatToolResult(result));
        } catch (error: unknown) {
          return makeError(`Get accounts failed: ${errorMessage(error)}`);
        }
      },
    },
    { optional: true },
  );
}
