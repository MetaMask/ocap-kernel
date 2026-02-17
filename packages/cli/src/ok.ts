/* eslint-disable n/no-process-exit, n/no-sync, no-negated-condition */
import '@metamask/kernel-shims/endoify-node';
import { existsSync, fstatSync } from 'node:fs';
import { writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  getSocketPath,
  sendCommand,
  readStdin,
  readRefFromStdin,
  readRefFromFile,
} from './commands/daemon-client.ts';
import { ensureDaemon } from './commands/daemon-spawn.ts';

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

  // For launch: resolve relative bundleSpec paths to file:// URLs
  if (method === 'launch') {
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
    const { isDaemonRunning } = await import('./commands/daemon-client.ts');
    if (await isDaemonRunning(socketPath)) {
      process.stderr.write(
        'Stopping daemon... (send SIGTERM to daemon process)\n',
      );
      process.stderr.write(
        `Run: kill $(lsof -t ${socketPath}) or use pkill -f daemon-entry\n`,
      );
    } else {
      process.stderr.write('Daemon is not running.\n');
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
  let consoleName = 'system-console';
  const consoleIdx = args.indexOf('--console');
  if (consoleIdx !== -1 && args[consoleIdx + 1]) {
    consoleName = args[consoleIdx + 1] ?? consoleName;
  }

  // eslint-disable-next-line n/no-process-env -- CLI sets env for daemon child process
  process.env.OCAP_CONSOLE_NAME = consoleName;

  await ensureDaemon(socketPath);

  // Check if the .ocap file exists
  const ocapPath = `${consoleName}.ocap`;
  if (!existsSync(ocapPath)) {
    // Request listRefs from the daemon to find the system console ref
    const response = await sendCommand(socketPath, { method: 'listRefs' });

    if (response.ok) {
      const result = response.result as {
        refs: { ref: string; kref: string }[];
      };
      const firstRef = result.refs[0];
      if (firstRef) {
        const content = `#!/usr/bin/env ok\n${firstRef.ref}\n`;
        await writeFile(ocapPath, content);
        await chmod(ocapPath, 0o755);
        process.stderr.write(`Created ${ocapPath}\n`);
      }
    }
  }

  process.stderr.write(`Daemon running. Socket: ${socketPath}\n`);
}

/**
 * Handle revoke command.
 *
 * @param args - CLI arguments after `ok revoke`.
 * @param socketPath - The daemon socket path.
 */
async function handleRevoke(args: string[], socketPath: string): Promise<void> {
  let ref: string;

  const firstArg = args[0];
  if (
    firstArg !== undefined &&
    (firstArg.endsWith('.ocap') || existsSync(firstArg))
  ) {
    ref = await readRefFromFile(firstArg);
  } else if (
    !process.stdin.isTTY &&
    (fstatSync(0).isFIFO() || fstatSync(0).isFile())
  ) {
    ref = await readRefFromStdin();
  } else {
    process.stderr.write(
      'Usage: ok revoke <file.ocap>\n       ok revoke < file.ocap\n',
    );
    process.exit(1);
  }

  const response = await sendCommand(socketPath, {
    method: 'revoke',
    args: [ref],
  });

  if (response.ok && (response.result as { ok: boolean }).ok) {
    process.stderr.write(`Revoked ref: ${ref}\n`);
  } else {
    process.stderr.write(`Ref not found: ${ref}\n`);
    process.exit(1);
  }
}

const socketPath = getSocketPath();

const cli = yargs(hideBin(process.argv))
  .scriptName('ok')
  .usage('$0 [file.ocap] <command> [...args]')

  .command(
    'launch [config]',
    'Launch a subcluster',
    (_yargs) =>
      _yargs
        .positional('config', {
          describe: 'Cluster config as inline JSON string',
          type: 'string',
        })
        .example(
          '$0 launch \'{"bootstrap":"v","vats":{"v":{"bundleSpec":"file:///path/to.bundle"}}}\'',
          'Inline JSON',
        )
        .example('$0 launch < config.json > root.ocap', 'File redirect')
        .example('cat config.json | $0 launch', 'Piped'),
    async (args) => {
      await ensureDaemon(socketPath);
      await handleInvoke(
        ['launch', ...(args.config ? [args.config] : [])],
        socketPath,
      );
    },
  )

  .command(
    'terminate <subclusterId>',
    'Terminate a subcluster',
    (_yargs) =>
      _yargs.positional('subclusterId', {
        describe: 'ID of the subcluster to terminate',
        type: 'string',
        demandOption: true,
      }),
    async (args) => {
      await ensureDaemon(socketPath);
      await handleInvoke(['terminate', String(args.subclusterId)], socketPath);
    },
  )

  .command(
    'status',
    'Show kernel status',
    () => ({}),
    async () => {
      await ensureDaemon(socketPath);
      await handleInvoke(['status'], socketPath);
    },
  )

  .command(
    'subclusters',
    'List subclusters',
    () => ({}),
    async () => {
      await ensureDaemon(socketPath);
      await handleInvoke(['subclusters'], socketPath);
    },
  )

  .command(
    'listRefs',
    'List all issued refs',
    () => ({}),
    async () => {
      await ensureDaemon(socketPath);
      await handleInvoke(['listRefs'], socketPath);
    },
  )

  .command(
    'help',
    'Show available kernel commands',
    () => ({}),
    async () => {
      await ensureDaemon(socketPath);
      await handleInvoke(['help'], socketPath);
    },
  )

  .command(
    'revoke [target]',
    'Revoke a capability ref',
    (_yargs) =>
      _yargs
        .positional('target', {
          describe: 'Path to .ocap file',
          type: 'string',
        })
        .example('$0 revoke file.ocap', 'By file path')
        .example('$0 revoke < file.ocap', 'From stdin'),
    async (args) => {
      await handleRevoke(args.target ? [String(args.target)] : [], socketPath);
    },
  )

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
          describe: 'System console name',
          type: 'string',
          default: 'system-console',
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
      if (args.console && args.console !== 'system-console') {
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
