/**
 * Daemon communication layer for the OpenClaw wallet plugin.
 *
 * Spawns `ocap daemon exec` commands and decodes Endo CapData responses.
 */
import { spawn } from 'node:child_process';

type ExecResult = { stdout: string; stderr: string; code: number | null };
type CapDataLike = { body: string; slots: unknown[] };

export type WalletCallOptions = {
  cliPath: string;
  walletKref: string;
  method: string;
  args: unknown[];
  timeoutMs: number;
};

/**
 * Bound wallet caller — pre-configured with CLI path, kref, and timeout.
 */
export type WalletCaller = (
  method: string,
  args: unknown[],
  timeoutMs?: number,
) => Promise<unknown>;

/**
 * Create a bound wallet caller from plugin config.
 *
 * @param options - Wallet connection options.
 * @param options.cliPath - Path to the ocap CLI.
 * @param options.walletKref - Kernel reference for the wallet coordinator.
 * @param options.timeoutMs - Default timeout in ms.
 * @returns A bound caller function.
 */
export function makeWalletCaller(options: {
  cliPath: string;
  walletKref: string;
  timeoutMs: number;
}): WalletCaller {
  const { cliPath, walletKref, timeoutMs } = options;
  return async (method, args, overrideTimeout) =>
    callWallet({
      cliPath,
      walletKref,
      method,
      args,
      timeoutMs: overrideTimeout ?? timeoutMs,
    });
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

  let decoded: unknown;
  try {
    decoded = JSON.parse(bodyContent);
  } catch {
    throw new Error(`Wallet ${method} returned undecodable CapData body`);
  }

  // Handle Endo CapData error encoding: #{"#error": "message", ...}
  if (decoded !== null && typeof decoded === 'object' && '#error' in decoded) {
    const errorMsg = (decoded as Record<string, unknown>)['#error'];
    throw new Error(
      `Wallet ${method} failed: ${typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)}`,
    );
  }

  return decoded;
}

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
 * @returns The decoded response value.
 */
async function callWallet(options: WalletCallOptions): Promise<unknown> {
  const { cliPath, walletKref, method, args, timeoutMs } = options;
  const argsStr = JSON.stringify(args).slice(0, 200);
  console.error(`[wallet-plugin] -> ${method}(${argsStr})`); // eslint-disable-line no-console

  let result: ExecResult;
  try {
    result = await runDaemonExec({
      cliPath,
      method: 'queueMessage',
      params: [walletKref, method, args],
      timeoutMs,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[wallet-plugin] <- ${method} TIMEOUT/ERROR: ${reason}`); // eslint-disable-line no-console
    throw error;
  }

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    // eslint-disable-next-line no-console
    console.error(
      `[wallet-plugin] <- ${method} FAILED (exit ${result.code}): ${detail.slice(0, 200)}`,
    );
    throw new Error(`Wallet ${method} failed (exit ${result.code}): ${detail}`);
  }

  const decoded = decodeCapData(result.stdout.trim(), method);
  const preview =
    typeof decoded === 'string' ? decoded.slice(0, 80) : typeof decoded;
  console.error(`[wallet-plugin] <- ${method} ok (${preview})`); // eslint-disable-line no-console
  return decoded;
}
