import '@metamask/kernel-shims/endoify';

import cli from './cli.ts';
import { commands } from './commands.ts';

cli(process.argv, commands).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
