import { makeLogger } from '@ocap/utils';
import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { createBundle } from './commands/bundle.ts';
import { getServer } from './commands/serve.ts';
import { watchDir } from './commands/watch.ts';
import { defaultConfig } from './config.ts';
import type { Config } from './config.ts';
import { withTimeout } from './utils.ts';

const logger = makeLogger('[cli]');

await yargs(hideBin(process.argv))
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
      await Promise.all(args.targets.map(createBundle));
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
      logger.info(`starting ${appName} in ${resolvedDir} on ${url}`);
      const server = getServer(config);
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
      const { ready, error } = watchDir(args.dir);
      let handleClose: undefined | (() => Promise<void>);

      ready
        .then((close) => {
          handleClose = close;
          logger.info(`Watching ${args.dir}...`);
          return undefined;
        })
        .catch((reason) => logger.error(reason));

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

      await createBundle(resolvedDir);

      const handleClose = async (): Promise<void> => {
        await Promise.all(
          closeHandlers.map(async (close) => withTimeout(close(), 400)),
        );
      };

      const { ready: watchReady, error: watchError } = watchDir(resolvedDir);

      watchError.catch(async (reason) => {
        logger.error(reason);
        await handleClose();
      });

      const closeWatcher = await watchReady;
      closeHandlers.push(closeWatcher);

      const server = getServer({
        server: {
          port: args.port,
        },
        dir: resolvedDir,
      });
      const { close: closeServer, port } = await server.listen();
      closeHandlers.push(closeServer);

      logger.info(`bundling and serving ${resolvedDir} on localhost:${port}`);
    },
  )
  .help('help')
  .parse();
