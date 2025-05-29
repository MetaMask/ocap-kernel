import '@metamask/kernel-shims/endoify';

import cli from './cli.ts';
import { commands } from './commands.ts';
import { logger } from './logger.ts';

cli(process.argv, commands)
  // TODO: make this an exception by convention
  // eslint-disable-next-line n/no-process-exit
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  });
