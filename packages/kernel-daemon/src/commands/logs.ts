import type { Logger } from '@metamask/logger';
import { readFile } from 'node:fs/promises';

import { LOG_FILE } from '../constants.ts';

/**
 * Handle the `kernel daemon logs` command.
 * Prints the contents of the daemon log file.
 *
 * @param logger - Logger for output.
 */
export async function handleDaemonLogs(logger: Logger): Promise<void> {
  try {
    const content = await readFile(LOG_FILE, 'utf-8');
    logger.info(content);
  } catch {
    logger.info('No daemon log file found');
  }
}
