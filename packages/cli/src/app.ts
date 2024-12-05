import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { createBundle } from './commands/bundle.js';
import { getServer } from './commands/serve.js';
import { defaultConfig } from './config.js';

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
    'serve <dir> [-p port]',
    'Serve bundled user code by filename',
    (_yargs) =>
      _yargs
        .option('port', {
          alias: 'p',
          type: 'number',
          default: defaultConfig.server.port,
        })
        .option('dir', {
          alias: 'd',
          type: 'string',
          dir: true,
          required: true,
          describe: 'A directory of files to bundle',
        }),
    async (args) => {
      console.info(`serving ${args.dir} on localhost:${args.port}`);
      const server = getServer({
        server: {
          port: args.port,
        },
        dir: args.dir,
      });
      await server.listen();
    },
  )
  .help('h')
  .alias('h', 'help')
  .parse();
