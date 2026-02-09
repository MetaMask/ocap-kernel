import type { Argv } from 'yargs';

import { handleDaemonFlush } from './flush.ts';
import { handleInspect } from './inspect.ts';
import { handleInvoke } from './invoke.ts';
import { handleLaunch } from './launch.ts';
import { handleDaemonLogs } from './logs.ts';
import { handleDaemonPid } from './pid.ts';
import { handleDaemonRestart } from './restart.ts';
import { handleDaemonStart } from './start.ts';
import { handleDaemonStatus } from './status.ts';
import { handleDaemonStop } from './stop.ts';
import type { DaemonCommandsConfig } from './types.ts';
import { handleUrlIssue } from './url-issue.ts';
import { handleUrlRedeem } from './url-redeem.ts';
import { handleView } from './view.ts';

/**
 * Run a daemon command handler and exit the process on completion.
 * Errors propagate to yargs' fail handler; successful completion exits with 0.
 *
 * @param fn - The async handler to run.
 * @returns A promise that exits the process on success.
 */
async function runAndExit(fn: () => Promise<void>): Promise<void> {
  await fn();
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
}

/**
 * Register all daemon subcommands on the given yargs instance.
 * Captures config in closure so individual handlers receive injected dependencies.
 * Every handler exits the process with code 0 after completing successfully.
 *
 * @param yargs - The yargs instance to extend (the `daemon` subcommand builder).
 * @param config - Injected configuration (logger, getMethodSpecs, daemonProcessPath).
 * @returns The extended yargs instance.
 */
export function registerDaemonCommands(
  yargs: Argv,
  config: DaemonCommandsConfig,
): Argv {
  const { logger, getMethodSpecs, daemonProcessPath } = config;

  return yargs
    .command(
      'start',
      'Start the background kernel daemon',
      (yg) => yg,
      async () =>
        runAndExit(async () => {
          try {
            await handleDaemonStart(daemonProcessPath, logger);
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith('Daemon already running')
            ) {
              logger.info(error.message);
            } else {
              throw error;
            }
          }
        }),
    )
    .command(
      'stop',
      'Stop the background kernel daemon',
      (yg) => yg,
      async () => runAndExit(async () => handleDaemonStop(logger)),
    )
    .command(
      'status',
      'Show daemon status',
      (yg) => yg,
      async () => runAndExit(async () => handleDaemonStatus(logger)),
    )
    .command(
      'restart',
      'Restart the background kernel daemon',
      (yg) =>
        yg.option('flush', {
          type: 'boolean',
          default: false,
          describe: 'Flush the daemon database before restarting',
        }),
      async (args) =>
        runAndExit(async () =>
          handleDaemonRestart(daemonProcessPath, logger, {
            flush: args.flush,
          }),
        ),
    )
    .command(
      'flush',
      'Delete the daemon database (daemon must be stopped)',
      (yg) => yg,
      async () => runAndExit(async () => handleDaemonFlush(logger)),
    )
    .command(
      'pid',
      'Print the daemon process ID',
      (yg) => yg,
      async () => runAndExit(async () => handleDaemonPid(logger)),
    )
    .command(
      'logs',
      'Print the daemon log file',
      (yg) => yg,
      async () => runAndExit(async () => handleDaemonLogs(logger)),
    )
    .command(
      'launch <path>',
      'Launch a .bundle or subcluster.json via the daemon',
      (yg) =>
        yg.positional('path', {
          type: 'string',
          demandOption: true,
          describe: 'Path to a .bundle or subcluster.json file',
        }),
      async (args) =>
        runAndExit(async () => handleLaunch(args.path, getMethodSpecs, logger)),
    )
    .command('view [command]', 'View kernel state', (yg) =>
      yg
        .command(
          'objects',
          'List kernel objects (ko*)',
          (yg2) => yg2,
          async () =>
            runAndExit(async () =>
              handleView('objects', getMethodSpecs, logger),
            ),
        )
        .command(
          'promises',
          'List kernel promises (kp*)',
          (yg2) => yg2,
          async () =>
            runAndExit(async () =>
              handleView('promises', getMethodSpecs, logger),
            ),
        )
        .command(
          'vats',
          'List kernel vat entries (v*)',
          (yg2) => yg2,
          async () =>
            runAndExit(async () => handleView('vats', getMethodSpecs, logger)),
        )
        .demandCommand(
          1,
          'Specify a view subcommand: objects, promises, or vats',
        ),
    )
    .command(
      'invoke <kref> <method> [args..]',
      'Invoke a method on a kernel object via the daemon',
      (yg) =>
        yg
          .positional('kref', {
            type: 'string',
            demandOption: true,
            describe: 'The kernel reference (e.g. ko1)',
          })
          .positional('method', {
            type: 'string',
            demandOption: true,
            describe: 'The method name to invoke',
          })
          .positional('args', {
            type: 'string',
            array: true,
            default: [] as string[],
            describe: 'Arguments to pass (JSON-parsed if possible)',
          }),
      async (args) =>
        runAndExit(async () =>
          handleInvoke(
            args.kref,
            args.method,
            args.args ?? [],
            getMethodSpecs,
            logger,
          ),
        ),
    )
    .command(
      'inspect <kref>',
      'Inspect a kernel object (methods, guard, schema)',
      (yg) =>
        yg.positional('kref', {
          type: 'string',
          demandOption: true,
          describe: 'The kernel reference (e.g. ko1)',
        }),
      async (args) =>
        runAndExit(async () =>
          handleInspect(args.kref, getMethodSpecs, logger),
        ),
    )
    .command('url [command]', 'Issue and redeem OCAP URLs', (yg) =>
      yg
        .command(
          'issue <kref>',
          'Issue an OCAP URL for a kernel object',
          (yg2) =>
            yg2.positional('kref', {
              type: 'string',
              demandOption: true,
              describe: 'The kernel reference (e.g. ko1)',
            }),
          async (args) =>
            runAndExit(async () =>
              handleUrlIssue(args.kref, getMethodSpecs, logger),
            ),
        )
        .command(
          'redeem <url>',
          'Redeem an OCAP URL to get its kernel reference',
          (yg2) =>
            yg2.positional('url', {
              type: 'string',
              demandOption: true,
              describe: 'The OCAP URL to redeem',
            }),
          async (args) =>
            runAndExit(async () =>
              handleUrlRedeem(args.url, getMethodSpecs, logger),
            ),
        )
        .demandCommand(1, 'Specify a url subcommand: issue or redeem'),
    );
}

export { handleDaemonStart } from './start.ts';
export type { DaemonCommandsConfig } from './types.ts';
