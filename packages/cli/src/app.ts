import '@metamask/kernel-shims/endoify-node';
import { Logger } from '@metamask/logger';
import type { LogEntry } from '@metamask/logger';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { bundleSource } from './commands/bundle.ts';
import { handleCompile } from './commands/generate-binary.ts';
import { getServer } from './commands/serve.ts';
import { watchDir } from './commands/watch.ts';
import { defaultConfig } from './config.ts';
import type { Config } from './config.ts';
import { startRelay } from './relay.ts';
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
    'compile <name>',
    'Generate a compiled console binary',
    (_yargs) =>
      _yargs
        .option('name', {
          type: 'string',
          required: true,
          describe: 'Output file name/path for the binary',
        })
        .option('ocap-url', {
          type: 'string',
          required: true,
          describe: 'OCAP URL for the console vat root object',
        })
        .option('endpoint-url', {
          type: 'string',
          required: true,
          describe: 'HTTP endpoint URL for the kernel invocation server',
        }),
    async (args) => {
      await handleCompile({
        name: args.name,
        ocapURL: args.ocapUrl,
        endpointURL: args.endpointUrl,
        logger,
      });
    },
  )
  .command(
    'relay',
    'Start a relay server',
    (_yargs) => _yargs,
    async () => {
      await startRelay(logger);
    },
  );

await yargsInstance.help('help').parse();
