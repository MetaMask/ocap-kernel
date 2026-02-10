import { Logger, makeTaglessConsoleTransport } from '@metamask/logger';
import { makeFileTransport } from '@metamask/logger/file-transport';
import { handleDaemonStart, registerDaemonCommands } from '@ocap/kernel-daemon';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Argv } from 'yargs';

const DAEMON_LOG_FILE = join(homedir(), '.ocap-kernel-daemon', 'daemon.log');

/**
 * Create a logger for daemon CLI commands that writes to console (without tags)
 * and to the daemon log file (with tags).
 *
 * @returns A Logger configured with console and file transports.
 */
function makeDaemonLogger(): Logger {
  return new Logger({
    tags: ['daemon'],
    transports: [
      makeTaglessConsoleTransport(),
      makeFileTransport(DAEMON_LOG_FILE),
    ],
  });
}

/**
 * Register the `kernel` command group on the given yargs instance.
 *
 * @param yargs - The yargs instance to extend.
 * @param _logger - Logger for command output.
 * @returns The extended yargs instance.
 */
export function registerKernelCommands(yargs: Argv, _logger: Logger): Argv {
  return yargs.command(
    'kernel [command]',
    'Manage the ocap kernel daemon',
    (_yargs) =>
      _yargs.showHelpOnFail(false).command(
        'daemon [command]',
        'Manage the background kernel daemon',
        (yg) => {
          const daemonLogger = makeDaemonLogger();
          const daemonProcessPath = fileURLToPath(
            new URL('./daemon-process.mjs', import.meta.url),
          );
          const getMethodSpecs = async (): Promise<
            Record<string, { method: string }>
          > => {
            // eslint-disable-next-line import-x/no-extraneous-dependencies
            const { rpcMethodSpecs } = await import(
              '@metamask/kernel-browser-runtime/rpc-handlers'
            );
            return rpcMethodSpecs;
          };
          return registerDaemonCommands(yg, {
            logger: daemonLogger,
            getMethodSpecs,
            daemonProcessPath,
          });
        },
        async (args) => {
          if (!args.command) {
            const daemonLogger = makeDaemonLogger();
            const daemonProcessPath = fileURLToPath(
              new URL('./daemon-process.mjs', import.meta.url),
            );
            try {
              await handleDaemonStart(daemonProcessPath, daemonLogger);
            } catch (error) {
              if (
                error instanceof Error &&
                error.message.startsWith('Daemon already running')
              ) {
                daemonLogger.info(error.message);
              } else {
                throw error;
              }
            }
            // eslint-disable-next-line n/no-process-exit
            process.exit(0);
          }
        },
      ),
    (_args) => {
      // no-op: bare `kernel` shows help via demandCommand
    },
  );
}
