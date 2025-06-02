import cli from './cli.ts';
import { commands } from './commands.ts';

cli(process.argv, commands)
  .then(() => {
    // TODO: make this an exception by convention
    // eslint-disable-next-line n/no-process-exit
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  });
