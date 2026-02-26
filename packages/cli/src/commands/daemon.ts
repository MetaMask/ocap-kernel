import { isJsonRpcFailure } from '@metamask/utils';
import { deleteDaemonState } from '@ocap/nodejs/daemon';
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
 * the socket is unresponsive, and escalates to SIGKILL if SIGTERM is ignored.
 *
 * @param socketPath - The daemon socket path.
 * @returns True if the daemon was stopped (or was not running), false if it
 * failed to stop within the timeout.
 */
export async function stopDaemon(socketPath: string): Promise<boolean> {
  const pidPath = join(homedir(), '.ocap', 'daemon.pid');
  const pid = await readPidFile(pidPath);
  const processAlive = pid !== undefined && isProcessAlive(pid);
  const socketResponsive = await pingDaemon(socketPath);

  if (!socketResponsive && !processAlive) {
    if (pid !== undefined) {
      await rm(pidPath, { force: true });
    }
    process.stderr.write('Daemon is not running.\n');
    return true;
  }

  process.stderr.write('Stopping daemon...\n');

  let stopped = false;

  // Strategy 1: Graceful socket-based shutdown.
  if (socketResponsive) {
    try {
      await sendCommand({ socketPath, method: 'shutdown' });
    } catch {
      // Socket became unresponsive.
    }
    stopped = await waitFor(async () => !(await pingDaemon(socketPath)), 5_000);
  }

  // Strategy 2: SIGTERM.
  if (!stopped && pid !== undefined) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      stopped = true;
    }
    if (!stopped) {
      stopped = await waitFor(() => !isProcessAlive(pid), 5_000);
    }
  }

  // Strategy 3: SIGKILL.
  if (!stopped && pid !== undefined) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      stopped = true;
    }
    if (!stopped) {
      stopped = await waitFor(() => !isProcessAlive(pid), 2_000);
    }
  }

  if (stopped) {
    await rm(pidPath, { force: true });
    process.stderr.write('Daemon stopped.\n');
  } else {
    process.stderr.write('Daemon did not stop within timeout.\n');
  }
  return stopped;
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
 * Stop the daemon (if running) and delete all state.
 *
 * @param socketPath - The daemon socket path.
 */
export async function handleDaemonBegone(socketPath: string): Promise<void> {
  const stopped = await stopDaemon(socketPath);
  if (!stopped) {
    process.stderr.write(
      'Refusing to delete state while the daemon is still running.\n',
    );
    process.exitCode = 1;
    return;
  }
  await deleteDaemonState({ socketPath });
  process.stderr.write('All daemon state deleted.\n');
}

/**
 * Send an RPC method call to the daemon.
 *
 * @param args - Positional arguments: [method, params-json].
 * @param socketPath - The daemon socket path.
 * @param options - Additional options.
 * @param options.timeoutMs - Read timeout in milliseconds.
 */
export async function handleDaemonExec(
  args: string[],
  socketPath: string,
  { timeoutMs }: { timeoutMs?: number } = {},
): Promise<void> {
  const method = args[0] ?? 'getStatus';
  const rawParams = args[1];

  // For launchSubcluster: resolve relative bundleSpec paths to file:// URLs.
  let params: Record<string, unknown> | undefined;
  if (rawParams !== undefined) {
    try {
      const parsed = JSON.parse(rawParams) as Record<string, unknown>;
      const { config } = parsed as { config?: unknown };
      if (method === 'launchSubcluster' && isClusterConfigLike(config)) {
        params = {
          ...parsed,
          config: resolveBundleSpecs(config),
        };
      } else {
        params = parsed;
      }
    } catch {
      process.stderr.write('Error: params-json must be valid JSON.\n');
      process.exitCode = 1;
      return;
    }
  }

  const response = await sendCommand({
    socketPath,
    method,
    params,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

  if (isJsonRpcFailure(response)) {
    process.stderr.write(
      `Error: ${response.error.message} (code ${String(response.error.code)})\n`,
    );
    process.exitCode = 1;
    return;
  }

  const isTTY = process.stdout.isTTY ?? false;
  if (isTTY) {
    process.stdout.write(`${JSON.stringify(response.result, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(response.result)}\n`);
  }
}

/**
 * Read a PID from a file.
 *
 * @param pidPath - The PID file path.
 * @returns The PID, or undefined if the file is missing or invalid.
 */
async function readPidFile(pidPath: string): Promise<number | undefined> {
  try {
    const pid = Number(await readFile(pidPath, 'utf-8'));
    return pid > 0 && !Number.isNaN(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check whether a process is alive by sending signal 0.
 *
 * @param pid - The process ID to check.
 * @returns True if the process exists.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Poll until a condition is met or the timeout elapses.
 *
 * @param check - A function that returns true when the condition is met.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @returns True if the condition was met, false on timeout.
 */
async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return true;
    }
    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 250));
  }
  return await check();
}
