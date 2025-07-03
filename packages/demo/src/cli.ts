import yargs from 'yargs';

import type { CommandModule } from './commands.ts';

/**
 * The entry point of `demo`, a yargs application for running  demos.
 *
 * @param argv - The unmodified `process.argv`.
 * @param commands - The yargs command modules.
 */
export default async function cli(
  argv: string[],
  // Parameterized for easier testing.
  commands: CommandModule[],
): Promise<void> {
  let theseYargs = yargs(argv.slice(2))
    .scriptName('demo')
    // Disable --version. This is an internal tool and it doesn't have a version.
    .version(false)
    .usage('$0 command [options]');

  for (const command of commands) {
    theseYargs = theseYargs.command(
      command as unknown as Parameters<typeof theseYargs.command>[0],
    );
  }

  await theseYargs
    .strict()
    .check((args) => {
      // Trim all strings and ensure they are not empty.
      for (const key in args) {
        if (typeof args[key] === 'string') {
          args[key] = args[key].trim();

          if (args[key] === '') {
            throw new Error(
              `The argument "${key}" was processed to an empty string. Please provide a value with non-whitespace characters.`,
            );
          }
        }
      }

      return true;
    }, true) // `true` indicating that this check should be enabled for all commands and sub-commands.
    .showHelpOnFail(false)
    .help()
    .alias('help', 'h')
    .parseAsync();
}
