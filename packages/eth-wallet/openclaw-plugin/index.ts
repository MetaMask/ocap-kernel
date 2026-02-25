/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { spawn } from 'node:child_process';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLI = resolvePath(pluginDir, '../../cli/dist/app.mjs');
const DEFAULT_TIMEOUT_MS = 60_000;

type ExecResult = { stdout: string; stderr: string; code: number | null };
type CapDataLike = { body: string; slots: unknown[] };

/**
 * Run an `ocap daemon exec` command and return its output.
 *
 * @param options - Execution options.
 * @param options.cliPath - Path to the ocap CLI.
 * @param options.method - The daemon RPC method.
 * @param options.params - The method parameters.
 * @param options.timeoutMs - Timeout in ms.
 * @returns The command result.
 */
async function runDaemonExec(options: {
  cliPath: string;
  method: string;
  params: unknown;
  timeoutMs: number;
}): Promise<ExecResult> {
  const { cliPath, method, params, timeoutMs } = options;
  const daemonArgs = ['daemon', 'exec', method, JSON.stringify(params)];

  // If cliPath points to a .mjs file, invoke it via node.
  const command = cliPath.endsWith('.mjs') ? 'node' : cliPath;
  const args = cliPath.endsWith('.mjs') ? [cliPath, ...daemonArgs] : daemonArgs;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } finally {
        reject(new Error(`ocap daemon exec timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? null });
    });
  });
}

/**
 * Call a wallet coordinator method via the OCAP daemon.
 *
 * @param options - Call options.
 * @param options.cliPath - Path to the ocap CLI.
 * @param options.walletKref - Kernel reference for the wallet coordinator.
 * @param options.method - The coordinator method to call.
 * @param options.args - Arguments for the method.
 * @param options.timeoutMs - Timeout in ms.
 * @returns The command stdout.
 */
async function callWallet(options: {
  cliPath: string;
  walletKref: string;
  method: string;
  args: unknown[];
  timeoutMs: number;
}): Promise<unknown> {
  const { cliPath, walletKref, method, args, timeoutMs } = options;
  const result = await runDaemonExec({
    cliPath,
    method: 'queueMessage',
    params: [walletKref, method, args],
    timeoutMs,
  });

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`Wallet ${method} failed (exit ${result.code}): ${detail}`);
  }

  return decodeCapData(result.stdout.trim(), method);
}

/**
 * Check if a value looks like Endo CapData.
 *
 * @param value - The parsed JSON value.
 * @returns True when value has CapData shape.
 */
function isCapDataLike(value: unknown): value is CapDataLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('body' in value) || !('slots' in value)) {
    return false;
  }
  const { body } = value as { body?: unknown };
  const { slots } = value as { slots?: unknown };
  return typeof body === 'string' && Array.isArray(slots);
}

/**
 * Decode daemon JSON output, unwrapping Endo CapData.
 *
 * @param raw - Raw stdout from `ocap daemon exec`.
 * @param method - Wallet method name (for better errors).
 * @returns The decoded value.
 */
function decodeCapData(raw: string, method: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Wallet ${method} returned non-JSON output`);
  }

  if (!isCapDataLike(parsed)) {
    return parsed;
  }

  if (!parsed.body.startsWith('#')) {
    throw new Error(`Wallet ${method} returned invalid CapData body`);
  }

  const bodyContent = parsed.body.slice(1);

  // Handle error bodies from vat exceptions (e.g. "#error:message")
  if (bodyContent.startsWith('error:')) {
    throw new Error(`Wallet ${method} vat error: ${bodyContent.slice(6)}`);
  }

  try {
    return JSON.parse(bodyContent);
  } catch {
    throw new Error(`Wallet ${method} returned undecodable CapData body`);
  }
}

/**
 * Convert a decoded wallet result into text for OpenClaw responses.
 *
 * @param value - The decoded result.
 * @returns A string suitable for tool output.
 */
function formatToolResult(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const ETH_ADDRESS_RE = /^0x[\da-f]{40}$/iu;
const HEX_VALUE_RE = /^0x[\da-f]+$/iu;

/**
 * Format an error response for the plugin.
 *
 * @param text - The error message text.
 * @returns A plugin tool response containing the error.
 */
function makeError(text: string): {
  content: { type: 'text'; text: string }[];
} {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }] };
}

/**
 * Register the wallet plugin tools.
 *
 * @param api - The OpenClaw plugin API.
 */
export default function register(api: any): void {
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
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
            const accounts = await callWallet({
              cliPath,
              walletKref,
              method: 'getAccounts',
              args: [],
              timeoutMs,
            });
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
            const result = await callWallet({
              cliPath,
              walletKref,
              method: 'request',
              args: ['eth_getBalance', [addr, 'latest']],
              timeoutMs,
            });
            const balanceHex = typeof result === 'string' ? result : '0x0';
            const wei = BigInt(balanceHex);
            const ethAmount = `${(Number(wei) / 1e18).toFixed(6)} ETH`;
            lines.push(`${addr}: ${ethAmount} (${balanceHex})`);
          }
          return {
            content: [{ type: 'text' as const, text: lines.join('\n') }],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return makeError(`Balance lookup failed: ${message}`);
        }
      },
    },
    { optional: true },
  );

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
              "Value in hex wei (e.g. '0xde0b6b3a7640000' for 1 ETH)",
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
        if (!HEX_VALUE_RE.test(params.value)) {
          return makeError(
            "Invalid value. Must be a hex string (e.g. '0xde0b6b3a7640000' for 1 ETH).",
          );
        }

        try {
          const accountsResult = await callWallet({
            cliPath,
            walletKref,
            method: 'getAccounts',
            args: [],
            timeoutMs,
          });
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

          const result = await callWallet({
            cliPath,
            walletKref,
            method: 'sendTransaction',
            args: [{ from, to: params.to, value: params.value }],
            timeoutMs,
          });
          return {
            content: [
              { type: 'text' as const, text: formatToolResult(result) },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return makeError(`Send transaction failed: ${message}`);
        }
      },
    },
    { optional: true },
  );

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
          const result = await callWallet({
            cliPath,
            walletKref,
            method: 'signMessage',
            args: [params.message],
            timeoutMs,
          });
          return {
            content: [
              { type: 'text' as const, text: formatToolResult(result) },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return makeError(`Sign message failed: ${message}`);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'wallet_capabilities',
      label: 'Wallet capabilities',
      description:
        'Check wallet capabilities: local keys, delegations, peer wallet, bundler.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        try {
          const result = await callWallet({
            cliPath,
            walletKref,
            method: 'getCapabilities',
            args: [],
            timeoutMs,
          });
          return {
            content: [
              { type: 'text' as const, text: formatToolResult(result) },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return makeError(`Get capabilities failed: ${message}`);
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: 'wallet_accounts',
      label: 'Wallet accounts',
      description: 'List wallet accounts.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        try {
          const result = await callWallet({
            cliPath,
            walletKref,
            method: 'getAccounts',
            args: [],
            timeoutMs,
          });
          return {
            content: [
              { type: 'text' as const, text: formatToolResult(result) },
            ],
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          return makeError(`Get accounts failed: ${message}`);
        }
      },
    },
    { optional: true },
  );
}
