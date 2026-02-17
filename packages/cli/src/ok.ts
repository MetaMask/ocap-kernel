/* eslint-disable n/no-process-exit, n/no-sync, no-negated-condition */
import '@metamask/kernel-shims/endoify-node';
import { existsSync, fstatSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  getSocketPath,
  isDaemonRunning,
  sendCommand,
  readStdin,
  readRefFromFile,
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
 * Handle the core invocation: resolve ref, call method, output result.
 *
 * @param args - CLI arguments after `ok`.
 * @param socketPath - The daemon socket path.
 */
async function handleInvoke(args: string[], socketPath: string): Promise<void> {
  let ref: string | undefined;
  let method: string;
  let methodArgs: string[];

  const firstArg = args[0];
  if (
    firstArg !== undefined &&
    (firstArg.endsWith('.ocap') || existsSync(firstArg))
  ) {
    // File arg mode: ok <file.ocap> <method> [...args]
    ref = await readRefFromFile(firstArg);
    method = args[1] ?? 'help';
    methodArgs = args.slice(2);
  } else if (
    !process.stdin.isTTY &&
    (fstatSync(0).isFIFO() || fstatSync(0).isFile())
  ) {
    // Redirected stdin (pipe or file): could be a ref (d-<uuid>) or JSON data
    const stdinContent = await readStdin();
    if (!stdinContent) {
      throw new Error('No input on stdin');
    }
    if (stdinContent.startsWith('d-')) {
      // Ref mode: ok <method> [...args] < file.ocap
      ref = stdinContent;
      method = args[0] ?? 'help';
      methodArgs = args.slice(1);
    } else {
      // Data mode: cat config.json | ok launch
      method = args[0] ?? 'help';
      methodArgs = [stdinContent, ...args.slice(1)];
    }
  } else {
    // No ref — dispatch on the system console itself
    method = args[0] ?? 'help';
    methodArgs = args.slice(1);
  }

  // For launch: resolve relative bundleSpec paths to file:// URLs.
  // Handle shell word-splitting: `$(cat file.json)` without quotes splits
  // JSON into many args. Try joining all args as one JSON string first.
  if (method === 'launch') {
    methodArgs = rejoinSplitJson(methodArgs);
    methodArgs = methodArgs.map((arg) => {
      try {
        const parsed = JSON.parse(arg) as unknown;
        if (isClusterConfigLike(parsed)) {
          return JSON.stringify(resolveBundleSpecs(parsed));
        }
      } catch {
        // not JSON — leave as-is
      }
      return arg;
    });
  }

  // Parse args: try JSON for each, fall back to string
  const parsedArgs = methodArgs.map((arg) => {
    try {
      return JSON.parse(arg) as unknown;
    } catch {
      return arg;
    }
  });

  const request: { ref?: string; method: string; args?: unknown[] } = {
    method,
    ...(ref !== undefined ? { ref } : {}),
    ...(parsedArgs.length > 0 ? { args: parsedArgs } : {}),
  };

  const response = await sendCommand(socketPath, request);

  if (!response.ok) {
    process.stderr.write(`Error: ${response.error}\n`);
    process.exit(1);
  }

  const isTTY = process.stdout.isTTY ?? false;
  const { result } = response;

  // Check if result contains a ref (capability)
  const resultRef = isRefResult(result) ? result.ref : undefined;

  if (resultRef && !isTTY) {
    // Piped: output .ocap content for the ref
    process.stdout.write(`#!/usr/bin/env ok\n${resultRef}\n`);
  } else if (isTTY) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}

/**
 * Check if a result object contains a ref field.
 *
 * @param result - The result to check.
 * @returns True if the result has a ref string.
 */
function isRefResult(result: unknown): result is { ref: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'ref' in result &&
    typeof (result as { ref: unknown }).ref === 'string'
  );
}

/**
 * Rejoin args that were word-split by the shell from a single JSON value.
 *
 * When a user writes `ok launch $(cat config.json)` without quotes, bash
 * splits the JSON on whitespace into many argv entries. This function
 * detects that pattern and reassembles the original JSON.
 *
 * @param args - The method arguments (possibly word-split).
 * @returns The args, with split JSON rejoined into a single element.
 */
function rejoinSplitJson(args: string[]): string[] {
  if (args.length <= 1) {
    return args;
  }
  // If the first arg already parses as a complete JSON object, no fix needed
  const first = args[0];
  if (first !== undefined) {
    try {
      JSON.parse(first);
      return args;
    } catch {
      // First arg alone isn't valid JSON — try joining
    }
  }
  const joined = args.join(' ');
  try {
    JSON.parse(joined);
    return [joined];
  } catch {
    return args;
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
 * Handle daemon management commands.
 *
 * @param args - CLI arguments after `ok daemon`.
 * @param socketPath - The daemon socket path.
 */
async function handleDaemon(args: string[], socketPath: string): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'stop') {
    if (!(await isDaemonRunning(socketPath))) {
      process.stderr.write('Daemon is not running.\n');
      return;
    }

    const pidPath = join(homedir(), '.ocap', 'daemon.pid');

    let pid: number | undefined;
    try {
      pid = Number(await readFile(pidPath, 'utf-8'));
    } catch {
      // PID file missing — fall back to manual instructions
    }

    if (!pid || Number.isNaN(pid)) {
      process.stderr.write(
        'PID file not found. Stop the daemon manually:\n' +
          `  kill $(lsof -t ${tildify(socketPath)})\n`,
      );
      return;
    }

    process.stderr.write('Stopping daemon...\n');
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      process.stderr.write(
        'Failed to send SIGTERM (process may already be gone).\n',
      );
      await rm(pidPath, { force: true });
      return;
    }

    // Poll until socket stops responding (max 5s)
    const pollEnd = Date.now() + 5_000;
    while (Date.now() < pollEnd) {
      await new Promise((_resolve) => setTimeout(_resolve, 250));
      if (!(await isDaemonRunning(socketPath))) {
        break;
      }
    }

    await rm(pidPath, { force: true });

    if (await isDaemonRunning(socketPath)) {
      process.stderr.write('Daemon did not stop within 5 seconds.\n');
    } else {
      process.stderr.write('Daemon stopped.\n');
    }
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
    // eslint-disable-next-line import-x/no-extraneous-dependencies -- workspace package
    const { flushDaemon } = await import('@ocap/nodejs');
    await flushDaemon({ socketPath });
    process.stderr.write('All daemon state flushed.\n');
    return;
  }

  // Default: start daemon (or confirm running)
  let consolePath = 'system-console.ocap';
  const consoleIdx = args.indexOf('--console');
  if (consoleIdx !== -1 && args[consoleIdx + 1]) {
    consolePath = args[consoleIdx + 1] ?? consolePath;
  }

  // Resolve relative to PWD
  const ocapPath = resolve(consolePath);
  // Derive the console name from the filename (strip .ocap if present)
  const consoleName = ocapPath.endsWith('.ocap')
    ? ocapPath.slice(ocapPath.lastIndexOf('/') + 1, -5)
    : ocapPath.slice(ocapPath.lastIndexOf('/') + 1);

  // eslint-disable-next-line n/no-process-env -- CLI sets env for daemon child process
  process.env.OCAP_CONSOLE_NAME = consoleName;
  // eslint-disable-next-line n/no-process-env -- CLI sets env for daemon child process
  process.env.OCAP_CONSOLE_PATH = ocapPath;

  await ensureDaemon(socketPath);

  process.stderr.write(`Daemon running. Socket: ${tildify(socketPath)}\n`);
  if (existsSync(ocapPath)) {
    process.stderr.write(`Admin console: ${tildify(ocapPath)}\n`);
  }
}

const socketPath = getSocketPath();

const cli = yargs(hideBin(process.argv))
  .scriptName('ok')
  .usage('$0 [file.ocap] <command> [...args]')
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
        .option('console', {
          describe: 'Path for the .ocap admin file (relative to PWD)',
          type: 'string',
          default: 'system-console.ocap',
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
      if (args.console && args.console !== 'system-console.ocap') {
        daemonArgs.push('--console', String(args.console));
      }
      await handleDaemon(daemonArgs, socketPath);
    },
  )

  // Default: file.ocap dispatch or bare invocation
  .command(
    '$0 [args..]',
    false,
    (_yargs) => _yargs.strict(false),
    async (args) => {
      const invokeArgs = ((args.args ?? []) as string[]).map(String);
      await ensureDaemon(socketPath);
      await handleInvoke(
        invokeArgs.length > 0 ? invokeArgs : ['help'],
        socketPath,
      );
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
