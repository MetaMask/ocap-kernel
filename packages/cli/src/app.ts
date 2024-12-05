import path from 'node:path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { createBundle } from './commands/bundle.js';
import { getServer } from './commands/serve.js';
import { defaultConfig } from './config.js';
import type { Config } from './config.js';
import { makeTimeoutWithReset, withTimeout } from './utils.js';

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
    'serve <dir> [-p port] [options]',
    'Serve bundled user code by filename',
    (_yargs) =>
      _yargs
        .option('dir', {
          type: 'string',
          dir: true,
          required: true,
          describe: 'A directory of files to bundle',
        })
        .option('port', {
          alias: 'p',
          type: 'number',
          default: defaultConfig.server.port,
        })
        .option('hangup', {
          alias: 'h',
          type: 'number',
          array: false,
          default: 0,
          describe:
            'How long the server keeps running after receiving its last request. Set to 0 to disable.',
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
      console.info(`starting ${appName} in ${resolvedDir} on ${url}`);

      if (args.hangup === 0) {
        const server = getServer(config);
        await server.listen();
      } else {
        const parsedHangup = Number(args.hangup?.toString().split(',').at(-1));
        const { promise: hangup, reset: resetHangup } =
          makeTimeoutWithReset(parsedHangup);
        console.info(
          `${appName} will auto hangup after ${parsedHangup}ms without a request`,
        );

        const server = getServer(config, resetHangup);
        const { close } = await server.listen();

        await hangup;
        console.log(
          `terminating ${appName} after ${parsedHangup}ms without a request`,
        );
        await withTimeout(close(), 400).catch(console.error);
      }
    },
  )
  .help('help')
  .parse();
