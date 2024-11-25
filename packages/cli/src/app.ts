import { lstat } from 'fs/promises';
import { resolve } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { createBundle, createBundleDir } from './commands/bundle.js';
import { getServer } from './commands/serve.js';
import { defaultConfig } from './config.js';
import type { Config } from './config.js';

const demandOneOfOption =
  (...options: string[]) =>
  (argv: { [prop: string]: unknown }) => {
    const count = options.filter((option) => argv[option]).length;
    const lastOption = options.pop();

    if (count === 0) {
      throw new Error(
        `Exactly one of the arguments ${options.join(', ')} and ${lastOption} is required`,
      );
    } else if (count > 1) {
      throw new Error(
        `Arguments ${options.join(', ')} and ${lastOption} are mutually exclusive`,
      );
    }

    return true;
  };

await yargs(hideBin(process.argv))
  .usage('$0 <command> [options]')
  .command(
    'bundle [target] [-f files..]',
    'Bundle user code to be used in a vat',
    (_yargs) =>
      _yargs
        .option('target', {
          type: 'string',
          file: true,
          dir: true,
          describe: 'The file or directory of files to bundle',
        })
        .option('files', {
          alias: 'f',
          type: 'array',
          string: true,
          file: true,
          describe: 'The file(s) to bundle',
        })
        .check(demandOneOfOption('target', 'files')),
    async (args) => {
      const resolvePath = (path: string): string =>
        // eslint-disable-next-line n/no-process-env
        resolve(process.env.INIT_CWD ?? '.', path);
      if (args.files) {
        await Promise.all(
          args.files.map(async (file) => await createBundle(resolvePath(file))),
        );
        return;
      }
      if (args.target) {
        if ((await lstat(args.target)).isDirectory()) {
          await createBundleDir(resolvePath(args.target));
        } else {
          await createBundle(resolvePath(args.target));
        }
      }
    },
  )
  .command(
    'serve <dir>',
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
      const config: Config = {
        server: {
          port: args.port,
        },
        dir: args.dir,
      };
      const server = getServer(config);
      await server.listen();
    },
  )
  .help('h')
  .alias('h', 'help')
  .parse();
