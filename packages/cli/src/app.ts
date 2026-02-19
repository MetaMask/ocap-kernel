import '@metamask/kernel-shims/endoify-node';
import { startRelay } from '@metamask/kernel-utils/libp2p';
import { Logger } from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { bundleSource } from './commands/bundle.ts';
import { getSocketPath } from './commands/daemon-client.ts';
import { ensureDaemon } from './commands/daemon-spawn.ts';
import {
  handleDaemonBegone,
  handleDaemonExec,
  handleDaemonStart,
  stopDaemon,
} from './commands/daemon.ts';
import { getServer } from './commands/serve.ts';
import { watchDir } from './commands/watch.ts';
import { defaultConfig } from './config.ts';
import type { Config } from './config.ts';
import { withTimeout } from './utils.ts';

/**
 * Console transport that omits tags from output.
 *
 * @param entry - The log entry to write.
 */
function consoleTransport(entry: LogEntry): void {
  const args = [
    ...(entry.message ? [entry.message] : []),
    ...(entry.data ?? []),
  ];
  // eslint-disable-next-line no-console
  console[entry.level](...args);
}

const logger = new Logger({ tags: ['cli'], transports: [consoleTransport] });

const yargsInstance = yargs(hideBin(process.argv))
  .scriptName('ocap')
  .usage('$0 <command> [options]')
  .demandCommand(1)
  .strict()
  .command(
    'bundle <targets..>',
    'Bundle user code to be used in a vat',
    (_yargs) =>
      _yargs.option('targets', {
        type: 'string',
        file: true,
        dir: true,
        array: true,
        demandOption: true,
        describe: 'The files or directories of files to bundle',
      }),
    async (args) => {
      await Promise.all(
        args.targets.map(async (target) => bundleSource(target, logger)),
      );
    },
  )
  .command(
    'serve <dir> [options]',
    'Serve bundled user code by filename',
    (_yargs) =>
      _yargs
        .option('dir', {
          type: 'string',
          dir: true,
          required: true,
          describe: 'A directory containing bundle files to serve',
        })
        .option('port', {
          alias: 'p',
          type: 'number',
          default: defaultConfig.server.port,
        }),
    async (args) => {
      const appName = 'bundle server';
      const url = `http://localhost:${args.port}`;
      const resolvedDir = path.resolve(args.dir);
      const config: Config = {
        server: {
          port: args.port,
        },
        dir: resolvedDir,
      };
      logger.info(`Starting ${appName} in ${resolvedDir} on ${url}`);
      const server = getServer(config, logger);
      await server.listen();
    },
  )
  .command(
    'watch <dir>',
    'Bundle all .js files in the target dirs and rebundle on change.',
    (_yargs) =>
      _yargs.option('dir', {
        type: 'string',
        dir: true,
        required: true,
        describe: 'The directory to watch',
      }),
    (args) => {
      const { ready, error } = watchDir(args.dir, logger);
      let handleClose: undefined | (() => Promise<void>);

      ready
        .then((close) => {
          handleClose = close;
          logger.info(`Watching ${args.dir}...`);
          return undefined;
        })
        .catch(logger.error);

      error.catch(async (reason) => {
        logger.error(reason);
        // If watching started, close the watcher.
        return handleClose ? withTimeout(handleClose(), 400) : undefined;
      });
    },
  )
  .command(
    'start <dir> [-p port]',
    'Watch the target directory and serve from it on the given port.',
    (_yargs) =>
      _yargs
        .option('dir', {
          type: 'string',
          dir: true,
          required: true,
          describe: 'A directory containing source files to bundle and serve',
        })
        .option('port', {
          alias: 'p',
          type: 'number',
          default: defaultConfig.server.port,
        }),
    async (args) => {
      const closeHandlers: (() => Promise<void>)[] = [];
      const resolvedDir = path.resolve(args.dir);

      const handleClose = async (): Promise<void> => {
        await Promise.all(
          closeHandlers.map(async (close) => withTimeout(close(), 400)),
        );
      };

      const { ready: watchReady, error: watchError } = watchDir(
        resolvedDir,
        logger,
      );

      watchError.catch(async (reason) => {
        logger.error(reason);
        await handleClose();
      });

      const closeWatcher = await watchReady;
      closeHandlers.push(closeWatcher);

      const server = getServer(
        {
          server: {
            port: args.port,
          },
          dir: resolvedDir,
        },
        logger,
      );
      const { close: closeServer, port } = await server.listen();
      closeHandlers.push(closeServer);

      logger.info(`Bundling and serving ${resolvedDir} on localhost:${port}`);
    },
  )
  .command(
    'relay',
    'Start a relay server',
    (_yargs) => _yargs,
    async () => {
      await startRelay(logger);
    },
  )
  .command(
    'daemon',
    'Manage the OCAP daemon process',
    (_yargs) => {
      const socketPath = getSocketPath();

      return _yargs
        .command(
          'start',
          'Start the daemon (or confirm it is running)',
          (_y) => _y,
          async () => {
            await handleDaemonStart(socketPath);
          },
        )
        .command(
          'stop',
          'Stop the daemon',
          (_y) => _y,
          async () => {
            await stopDaemon(socketPath);
          },
        )
        .command(
          ['purge', 'begone'],
          'Stop the daemon and delete all state',
          (_y) =>
            _y.option('force', {
              describe: 'Confirm state deletion',
              type: 'boolean',
              demandOption: true,
            }),
          async (args) => {
            if (!args.force) {
              process.stderr.write(
                'Usage: ocap daemon purge --force\n' +
                  'This will delete all OCAP daemon state.\n',
              );
              process.exitCode = 1;
              return;
            }
            await handleDaemonBegone(socketPath);
          },
        )
        .command(
          'exec [method] [params-json]',
          'Send an RPC method call to the daemon',
          (_y) =>
            _y
              .positional('method', {
                describe: 'RPC method name (defaults to getStatus)',
                type: 'string',
              })
              .positional('params-json', {
                describe: 'JSON-encoded method parameters',
                type: 'string',
              })
              .example('$0 daemon exec', 'Get daemon status')
              .example(
                '$0 daemon exec getStatus',
                'Get daemon status (explicit)',
              )
              .example(
                '$0 daemon exec pingVat \'{"vatId":"v1"}\'',
                'Ping a vat',
              )
              .example(
                '$0 daemon exec executeDBQuery \'{"sql":"SELECT * FROM kv LIMIT 5"}\'',
                'Run a SQL query',
              )
              .example(
                '$0 daemon exec terminateVat \'{"vatId":"v1"}\'',
                'Terminate a vat',
              ),
          async (args) => {
            const execArgs: string[] = [];
            if (args.method) {
              execArgs.push(String(args.method));
            }
            if (args['params-json']) {
              execArgs.push(String(args['params-json']));
            }
            await ensureDaemon(socketPath);
            await handleDaemonExec(execArgs, socketPath);
          },
        )
        .command(
          '$0',
          false,
          (_y) => _y,
          async () => {
            await handleDaemonStart(socketPath);
          },
        );
    },
    () => {
      // Handled by subcommands.
    },
  );

await yargsInstance.help('help').parse();
