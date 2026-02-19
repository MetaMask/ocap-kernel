/* eslint-disable n/no-process-exit */
import { isJsonRpcFailure } from '@metamask/utils';
import { flushDaemon } from '@ocap/nodejs/daemon';
import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { pingDaemon, sendCommand } from './daemon-client.ts';
import { ensureDaemon } from './daemon-spawn.ts';

const home = homedir();

/**
 * Replace the home directory prefix with `~` for display.
 *
 * @param path - An absolute path.
 * @returns The path with the home prefix replaced.
 */
function tildefy(path: string): string {
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/**
 * Check if a value looks like a cluster config (has bootstrap + vats).
 *
 * @param value - The value to check.
 * @returns True if the value has bootstrap and vats fields.
 */
function isClusterConfigLike(
  value: unknown,
): value is { vats: Record<string, { bundleSpec?: string }> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'bootstrap' in value &&
    'vats' in value &&
    typeof (value as { vats: unknown }).vats === 'object'
  );
}

/**
 * Resolve relative bundleSpec paths in a cluster config to file:// URLs.
 *
 * @param config - The cluster config object.
 * @param config.vats - The vat configurations with optional bundleSpec paths.
 * @returns The config with resolved bundleSpec URLs.
 */
function resolveBundleSpecs(config: {
  vats: Record<string, { bundleSpec?: string }>;
}): unknown {
  const resolvedVats: Record<string, unknown> = {};
  for (const [vatName, vatConfig] of Object.entries(config.vats)) {
    const spec = vatConfig.bundleSpec;
    if (spec && !spec.includes('://')) {
      resolvedVats[vatName] = {
        ...vatConfig,
        bundleSpec: pathToFileURL(resolve(spec)).href,
      };
    } else {
      resolvedVats[vatName] = vatConfig;
    }
  }
  return { ...config, vats: resolvedVats };
}

/**
 * Stop the daemon via a `shutdown` RPC call. Falls back to PID + SIGTERM if
 * the socket is unresponsive.
 *
 * @param socketPath - The daemon socket path.
 */
export async function stopDaemon(socketPath: string): Promise<void> {
  if (!(await pingDaemon(socketPath))) {
    process.stderr.write('Daemon is not running.\n');
    return;
  }

  process.stderr.write('Stopping daemon...\n');

  // Try socket-based shutdown first.
  try {
    await sendCommand(socketPath, 'shutdown');
  } catch {
    // Socket unresponsive — fall back to PID + SIGTERM below.
  }

  // Poll until socket stops responding (max 5s).
  const pollEnd = Date.now() + 5_000;
  while (Date.now() < pollEnd) {
    await new Promise((_resolve) => setTimeout(_resolve, 250));
    if (!(await pingDaemon(socketPath))) {
      process.stderr.write('Daemon stopped.\n');
      return;
    }
  }

  // Fallback: read PID file and send SIGTERM.
  const pidPath = join(homedir(), '.ocap', 'daemon.pid');
  let pid: number | undefined;
  try {
    pid = Number(await readFile(pidPath, 'utf-8'));
  } catch {
    // PID file missing.
  }

  if (pid && !Number.isNaN(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may already be gone.
    }

    // Poll again after SIGTERM.
    const sigPollEnd = Date.now() + 5_000;
    while (Date.now() < sigPollEnd) {
      await new Promise((_resolve) => setTimeout(_resolve, 250));
      if (!(await pingDaemon(socketPath))) {
        await rm(pidPath, { force: true });
        process.stderr.write('Daemon stopped.\n');
        return;
      }
    }
  }

  process.stderr.write('Daemon did not stop within timeout.\n');
}

/**
 * Ensure the daemon is running and print its socket path.
 *
 * @param socketPath - The daemon socket path.
 */
export async function handleDaemonStart(socketPath: string): Promise<void> {
  await ensureDaemon(socketPath);
  process.stderr.write(`Daemon running. Socket: ${tildefy(socketPath)}\n`);
}

/**
 * Stop the daemon (if running) and flush all state.
 *
 * @param socketPath - The daemon socket path.
 */
export async function handleDaemonBegone(socketPath: string): Promise<void> {
  if (await pingDaemon(socketPath)) {
    await stopDaemon(socketPath);
  }
  await flushDaemon({ socketPath });
  process.stderr.write('All daemon state flushed.\n');
}

/**
 * Send an RPC method call to the daemon.
 *
 * @param args - Positional arguments: [method, params-json].
 * @param socketPath - The daemon socket path.
 */
export async function handleDaemonExec(
  args: string[],
  socketPath: string,
): Promise<void> {
  const method = args[0] ?? 'getStatus';
  const rawParams = args[1];

  // For launchSubcluster: resolve relative bundleSpec paths to file:// URLs.
  let params: Record<string, unknown> | undefined;
  if (rawParams !== undefined) {
    try {
      const parsed = JSON.parse(rawParams) as Record<string, unknown>;
      if (method === 'launchSubcluster' && isClusterConfigLike(parsed)) {
        params = resolveBundleSpecs(parsed) as Record<string, unknown>;
      } else {
        params = parsed;
      }
    } catch {
      // Not valid JSON — wrap as a simple value
      params = { value: rawParams };
    }
  }

  const response = await sendCommand(socketPath, method, params);

  if (isJsonRpcFailure(response)) {
    process.stderr.write(
      `Error: ${response.error.message} (code ${String(response.error.code)})\n`,
    );
    process.exit(1);
  }

  const isTTY = process.stdout.isTTY ?? false;
  if (isTTY) {
    process.stdout.write(`${JSON.stringify(response.result, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(response.result)}\n`);
  }
}
