/* eslint-disable n/no-process-exit */
import '@metamask/kernel-shims/endoify-node';
import { isJsonRpcFailure } from '@metamask/utils';
import { flushDaemon } from '@ocap/nodejs/daemon';
import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  getSocketPath,
  pingDaemon,
  sendCommand,
} from './commands/daemon-client.ts';
import { ensureDaemon } from './commands/daemon-spawn.ts';

const home = homedir();

/**
 * Replace the home directory prefix with `~` for display.
 *
 * @param path - An absolute path.
 * @returns The path with the home prefix replaced.
 */
function tildify(path: string): string {
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/**
 * Handle the core invocation: call an RPC method on the daemon.
 *
 * @param args - CLI arguments after `ok`.
 * @param socketPath - The daemon socket path.
 */
async function handleInvoke(args: string[], socketPath: string): Promise<void> {
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
async function stopDaemon(socketPath: string): Promise<void> {
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
 * Handle daemon management commands.
 *
 * @param args - CLI arguments after `ok daemon`.
 * @param socketPath - The daemon socket path.
 */
async function handleDaemon(args: string[], socketPath: string): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'stop') {
    await stopDaemon(socketPath);
    return;
  }

  if (subcommand === 'begone') {
    const forGood = args.includes('--forgood');
    if (!forGood) {
      process.stderr.write(
        'Usage: ok daemon begone --forgood\n' +
          'This will delete all OCAP daemon state.\n',
      );
      process.exit(1);
    }
    if (await pingDaemon(socketPath)) {
      await stopDaemon(socketPath);
    }
    await flushDaemon({ socketPath });
    process.stderr.write('All daemon state flushed.\n');
    return;
  }

  // Default: start daemon (or confirm running)
  await ensureDaemon(socketPath);
  process.stderr.write(`Daemon running. Socket: ${tildify(socketPath)}\n`);
}

const socketPath = getSocketPath();

const cli = yargs(hideBin(process.argv))
  .scriptName('ok')
  .usage('$0 <method> [params-json]')
  .help(false)

  .command(
    'daemon [subcommand]',
    'Manage the daemon process',
    (_yargs) =>
      _yargs
        .positional('subcommand', {
          describe: 'Subcommand: stop, begone',
          type: 'string',
        })
        .option('forgood', {
          describe: 'Confirm state deletion (for begone)',
          type: 'boolean',
        }),
    async (args) => {
      const daemonArgs: string[] = [];
      if (args.subcommand) {
        daemonArgs.push(String(args.subcommand));
      }
      if (args.forgood) {
        daemonArgs.push('--forgood');
      }
      await handleDaemon(daemonArgs, socketPath);
    },
  )

  // Default: RPC method dispatch
  .command(
    '$0 [args..]',
    false,
    (_yargs) => _yargs.strict(false),
    async (args) => {
      const invokeArgs = ((args.args ?? []) as string[]).map(String);
      await ensureDaemon(socketPath);
      await handleInvoke(invokeArgs, socketPath);
    },
  )

  .version(false)
  .fail((message, error) => {
    if (error) {
      process.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    } else if (message) {
      process.stderr.write(`${message}\n`);
    }
    process.exit(1);
  });

await cli.parse();
